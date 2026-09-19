const test = require('node:test');
const assert = require('node:assert/strict');
const { initialFollowUpAutomation, generateDrafts, exclusionReason, runAssessmentDraft, recoverAssessmentDraftQueue } = require('../src/utils/assessmentFollowUpAutomation');

const clone = value => structuredClone(value);
const get = (obj, key) => key.split('.').reduce((value, field) => value?.[field], obj);
const set = (obj, key, value) => {
  const fields = key.split('.');
  const last = fields.pop();
  const parent = fields.reduce((value, field) => value[field] ||= {}, obj);
  parent[last] = value;
};
function fixture(patch = {}) {
  const row = { _id: 'assessment', patientId: 'patient', createdBy: 'specialist', purpose: 'issue_collaboration', status: 'advisor_review', __v: 0,
    facts: ['已核对资料'], recommendations: { followUps: ['沟通下一步安排'] }, followUpDrafts: [], followUpAutomation: { status: 'queued', attempts: 0 }, ...patch };
  const state = { row, calls: 0, input: null, context: null };
  const apply = (query, update) => {
    if (!Object.entries(query).every(([key, value]) => get(row, key) === value)) return null;
    for (const [key, value] of Object.entries(update.$set || {})) set(row, key, clone(value));
    for (const [key, value] of Object.entries(update.$inc || {})) set(row, key, (get(row, key) || 0) + value);
    return clone(row);
  };
  const deps = {
    Assessment: { findById: () => ({ lean: async () => clone(row) }), findOneAndUpdate: async (q, u) => apply(q, u), updateOne: async (q, u) => apply(q, u) },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ assignedFamilyDoctor: 'advisor', tenantId: 'tenant', name: '不得进入提示词', phone: '不得进入提示词' }) }) }) },
    withAiContext: async (context, fn) => { state.context = context; return fn(); },
    chat: async (messages, options) => { state.calls++; state.input = { messages, options }; return JSON.stringify({ followUps: [{ title: '核对资料', content: '按已确认建议沟通安排', date: '2099-10-01', category: 'information', requiresService: false }] }); },
  };
  return { state, deps, row };
}

test('首次年度评估不自动另建动态任务；后续协作持久化排队', () => {
  assert.equal(initialFollowUpAutomation('annual_input').status, 'skipped');
  assert.equal(initialFollowUpAutomation('issue_collaboration').status, 'queued');
});

test('自动生成仅保存待审草稿，不改评估状态，不创建正式任务，并沿用AI额度上下文', async () => {
  const { deps, state, row } = fixture();
  await runAssessmentDraft(row._id, { automatic: true }, deps);
  assert.equal(row.status, 'advisor_review');
  assert.equal(row.followUpAutomation.status, 'ready');
  assert.equal(row.followUpDrafts.length, 1);
  assert.equal(state.calls, 1);
  assert.equal(state.context.actorId, 'advisor');
  assert.equal(state.context.tenantId, 'tenant');
  assert.doesNotMatch(JSON.stringify(state.input.messages), /不得进入提示词/);
  assert.equal(state.input.options.timeoutMs, 60000);
  assert.match(state.input.options.systemPrompt, /不预先安排多轮复查/);
  await runAssessmentDraft(row._id, { automatic: true }, deps);
  await runAssessmentDraft(row._id, { revision: row.__v }, deps);
  assert.equal(state.calls, 1);
});

test('并发事件只有一个AI调用，另一个原子抢占失败', async () => {
  const { deps, state, row } = fixture();
  const result = await Promise.allSettled([runAssessmentDraft(row._id, { automatic: true }, deps), runAssessmentDraft(row._id, { automatic: true }, deps)]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(state.calls, 1);
});

test('生成期间被审核/更新，旧AI结果不能回写', async () => {
  const { deps, row } = fixture();
  deps.chat = async () => { row.status = 'superseded'; row.__v++; return '{"followUps":[]}'; };
  await assert.rejects(runAssessmentDraft(row._id, { automatic: true }, deps), /已更新/);
  assert.deepEqual(row.followUpDrafts, []);
  assert.equal(row.status, 'superseded');
});

test('AI失败不自动循环调用、不记录供应商原文，可显式重试', async () => {
  const { deps, row, state } = fixture();
  const validChat = deps.chat;
  deps.chat = async () => { state.calls++; throw new Error('private clinical input'); };
  await assert.rejects(runAssessmentDraft(row._id, { automatic: true }, deps), /未完成/);
  assert.equal(row.followUpAutomation.status, 'failed');
  assert.doesNotMatch(row.followUpAutomation.message, /private/);
  await runAssessmentDraft(row._id, { automatic: true }, deps);
  assert.equal(state.calls, 1);
  deps.chat = validChat;
  await runAssessmentDraft(row._id, { revision: row.__v }, deps);
  assert.equal(row.followUpAutomation.status, 'ready');
  assert.equal(state.calls, 2);
});

test('历史草稿不覆盖、不重复扣费，待处理标记能够结束', async () => {
  const { deps, state, row } = fixture({ followUpDrafts: [{ title: '人工草稿' }] });
  await runAssessmentDraft(row._id, { automatic: true }, deps);
  assert.equal(state.calls, 0);
  assert.equal(row.followUpAutomation.status, 'ready');
  assert.equal(row.followUpDrafts[0].title, '人工草稿');
});

test('没有明确后续行动的空草稿是成功，不人为增加任务', async () => {
  const { deps, row } = fixture();
  deps.chat = async () => '{"followUps":[]}';
  await runAssessmentDraft(row._id, { automatic: true }, deps);
  assert.equal(row.followUpAutomation.status, 'ready');
  assert.deepEqual(row.followUpDrafts, []);
  assert.match(row.followUpAutomation.message, /不额外/);
});

test('年度、未核实外部意见和修订反馈均不自动扣费', async () => {
  for (const patch of [{ purpose: 'annual_input' }, { aiDraft: { externalSourceUnverified: true } }, { supersedesAssessmentId: 'old' }]) {
    const { deps, state, row } = fixture(patch);
    await runAssessmentDraft(row._id, { automatic: true }, deps);
    assert.equal(row.followUpAutomation.status, 'skipped');
    assert.equal(state.calls, 0);
  }
});

test('修订反馈经顾问确认可生成，但不能借此绕过未核实/服务来源保护', async () => {
  const { deps, state, row } = fixture({ supersedesAssessmentId: 'old', followUpAutomation: { status: 'skipped' } });
  await runAssessmentDraft(row._id, { revision: row.__v, allowRevision: true }, deps);
  assert.equal(state.calls, 1);
  const blocked = fixture({ supersedesAssessmentId: 'old', aiDraft: { externalSourceUnverified: true } });
  await runAssessmentDraft(blocked.row._id, { revision: 0, allowRevision: true }, blocked.deps);
  assert.equal(blocked.state.calls, 0);
});

test('关联报告未审核或已由服务闭环承接时跳过通用事件', async () => {
  for (const report of [null, { audit_status: 'unaudited' }, { audit_status: 'audited', sourceOrderId: 'order' }, { audit_status: 'audited', sourceHealthPlanId: 'plan' }, { audit_status: 'audited', planId: 'plan' }]) {
    assert.ok(await exclusionReason({ sourceRecordIds: ['r'], patientId: 'patient' }, {
      MedicalReport: { findOne: q => { assert.equal(q.user, 'patient'); return { select: () => ({ lean: async () => report }) }; } },
    }));
  }
  assert.match(await exclusionReason({ sourceRecordIds: ['r'], patientId: 'patient' }, {
    MedicalReport: { findOne: () => ({ select: () => ({ lean: async () => ({ audit_status: 'audited' }) }) }) },
    FollowUp: { exists: async () => true },
  }), /已有随访/);
});

test('缺少顾问时保留失败状态，不调用AI；错误版本不能启动生成', async () => {
  const { deps, row, state } = fixture();
  await assert.rejects(runAssessmentDraft(row._id, { revision: 8 }, deps), /已更新/);
  deps.User.findById = () => ({ select: () => ({ lean: async () => ({}) }) });
  await assert.rejects(runAssessmentDraft(row._id, { automatic: true }, deps), /未完成/);
  assert.equal(state.calls, 0);
  assert.equal(row.followUpAutomation.status, 'failed');
});

test('过去日期、非法日期、截断JSON和超大输入均不写入草稿', async () => {
  const { deps, row } = fixture();
  for (const raw of ['{"followUps":', '{"followUps":[{"title":"核对","content":"确认","date":"2020-01-01","category":"information"}]}', '{"followUps":[{"title":"核对","content":"确认","date":"2099-02-30","category":"information"}]}']) {
    deps.chat = async () => raw;
    await assert.rejects(generateDrafts(row, {}, deps));
  }
  row.facts = ['x'.repeat(41000)];
  await assert.rejects(generateDrafts(row, {}, deps), /过长/);
});

test('重启/每日恢复只处理新队列，超时变失败而非自动重发，并修复工作台入口', async () => {
  let woke = 0, reviewed = 0;
  await recoverAssessmentDraftQueue({
    Assessment: {
      updateMany: async (q, u) => { assert.equal(q['followUpAutomation.status'], 'running'); assert.ok(q['followUpAutomation.startedAt'].$lt); assert.equal(u.$set['followUpAutomation.status'], 'failed'); },
      find: q => { assert.equal(q.status, 'advisor_review'); assert.ok(!q['followUpAutomation.status'].$in.includes('idle')); return { cursor: async function* () { yield { _id: 'new' }; } }; },
    }, ensureReview: async () => { reviewed++; }, wake: () => { woke++; },
  });
  assert.equal(woke, 1);
  assert.equal(reviewed, 1);
});
