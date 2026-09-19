const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPreparationDraft, createPreparationDraft, draftIdFor } = require('../src/utils/checkupPreparationDraft');
const { eligibleCheckupPlan } = require('../src/utils/annualCheckupEvidence');
const annual = { _id: 'annual', patientId: 'patient', year: 2026, confirmedAt: '2026-09-01', pushedAt: '2026-08-30', reviewStatus: 'approved', moduleData: { annual_checkup: { focus: '已审核的年度重点' } } };
const task = { _id: 'task', patientId: 'patient', sourceAnnualPlanId: 'annual', assignedTo: 'advisor', updatedAt: new Date('2026-09-19'), status: 'planned', sourceType: 'annual_service',
  workflowKey: 'annual_checkup_preparation:familyDoctor', sourceScheduleKey: 'annual_checkup:2026-10-03:prepare:familyDoctor',
  formData: { annualCheckupPreparation: { version: 1, role: 'familyDoctor', targetDate: '2026-10-03' } } };
const actor = { _id: 'advisor', role: 'familyDoctor' };
const patient = { _id: 'patient', name: '测试', clientBrand: 'jiayiguanjia' };
const template = { _id: 'template', type: 'annual_checkup', status: 'active', clientBrand: 'jiayiguanjia', name: '标准体检', content: {
  checkItems: [{ name: '标准检验项', type: 'lab' }, { name: '标准影像项', type: 'exam' }], addons: [{ name: '可选项目', type: 'exam' }],
} };
const input = { templateId: 'template', updatedAt: task.updatedAt };
function harness() {
  const rows = new Map(); let binds = 0; let allowBind = true;
  const models = {
    isValidId: value => Boolean(value),
    User: { findById: () => ({ lean: async () => patient }) },
    PlanTemplate: { findById: () => ({ lean: async () => template }) },
    HealthPlan: { findById: id => ({ lean: async () => rows.get(String(id)) || null }),
      updateOne: async (filter, update, options) => {
        assert.deepEqual(Object.keys(update), ['$setOnInsert']); assert.equal(options.upsert, true);
        if (!rows.has(filter._id)) rows.set(filter._id, { ...structuredClone(update.$setOnInsert), createdAt: new Date('2026-09-19') });
      } },
    FollowUp: { updateOne: async (filter, update) => { binds++; assert.equal(update.$set.status, 'in_progress'); return { matchedCount: allowBind ? 1 : 0 }; } },
  };
  return { models, rows, failBinding: value => { allowBind = !value; }, bindings: () => binds };
}

test('模板原样保留基础项与加项库，只建立待审草稿，不虚构AI加项或服务关联', () => {
  const before = JSON.stringify({ task, annual, patient, template });
  const draft = buildPreparationDraft(task, annual, patient, template, actor);
  assert.equal(draft._id, draftIdFor(task._id)); assert.equal(draft.preparationTaskId, 'task');
  assert.equal(draft.status, 'draft'); assert.equal(draft.content.aiStatus, 'pending');
  assert.equal(draft.content.generationMode, 'preparation_template');
  assert.equal(draft.items.length, 2); assert.ok(draft.items.every(item => item.itemGroup === 'base' && item.scheduledDate === null));
  assert.deepEqual(draft.content.addons, template.content.addons);
  assert.equal(draft.content.serviceInstanceId, null); assert.equal(draft.sourceOrderId, undefined);
  assert.equal(draft.pushedAt, undefined); assert.equal(draft.confirmedAt, undefined);
  assert.equal(JSON.stringify({ task, annual, patient, template }), before);
});

test('拒绝跨平台、停用、非体检及空标准项目模板', () => {
  for (const patch of [{ clientBrand: 'other' }, { status: 'inactive' }, { type: 'medical_assist' }, { content: { checkItems: [] } }, { content: { checkItems: [{ name: '' }] } }]) {
    assert.throws(() => buildPreparationDraft(task, annual, patient, { ...template, ...patch }, actor), { statusCode: 400 });
  }
  assert.doesNotThrow(() => buildPreparationDraft(task, annual, patient, { ...template, clientBrand: '' }, actor));
});

test('首次生成后自动关联；重试使用同一_id，不覆盖已经编辑的草稿', async () => {
  const db = harness();
  const first = await createPreparationDraft(task, annual, input, actor, db.models);
  assert.equal(first.reused, false); assert.equal(db.bindings(), 1);
  db.rows.get(first.plan._id).title = '顾问已经修改的标题';
  db.models.PlanTemplate.findById = () => assert.fail('已创建草稿不重新取模板');
  const retry = await createPreparationDraft(task, annual, input, actor, db.models);
  assert.equal(retry.reused, true); assert.equal(retry.plan.title, '顾问已经修改的标题'); assert.equal(db.rows.size, 1);
});

test('草稿创建成功但任务关联失败，重试恢复关联而不是再建方案', async () => {
  const db = harness(); db.failBinding(true);
  await assert.rejects(createPreparationDraft(task, annual, input, actor, db.models), { statusCode: 409 });
  assert.equal(db.rows.size, 1); db.failBinding(false);
  assert.equal((await createPreparationDraft(task, annual, input, actor, db.models)).reused, true);
  assert.equal(db.rows.size, 1);
});

test('并发创建只留下同一份草稿，模板快照不会被后续请求覆盖', async () => {
  const db = harness();
  await Promise.all([createPreparationDraft(task, annual, input, actor, db.models), createPreparationDraft(task, annual, input, actor, db.models)]);
  assert.equal(db.rows.size, 1);
});

test('错误岗位、任务版本变化、结束及已有绑定不能另建', async () => {
  for (const [row, by, code] of [[task, { _id: 'other', role: 'familyDoctor' }, 403],
    [{ ...task, status: 'completed' }, actor, 409], [{ ...task, updatedAt: new Date('2026-09-20') }, actor, 409],
    [{ ...task, formData: { annualCheckupPreparation: { ...task.formData.annualCheckupPreparation, evidence: { healthPlanId: 'existing' } } } }, actor, 409]]) {
    const db = harness(); await assert.rejects(createPreparationDraft(row, annual, input, by, db.models), { statusCode: code }); assert.equal(db.rows.size, 0);
  }
});

test('既有同ID记录来源冲突或取消时不篡改、不复活', async () => {
  for (const patch of [{ preparationTaskId: 'other' }, { patientId: 'other' }, { status: 'cancelled' }]) {
    const db = harness(); db.rows.set(draftIdFor(task._id), { ...buildPreparationDraft(task, annual, patient, template, actor), ...patch });
    await assert.rejects(createPreparationDraft(task, annual, input, actor, db.models), { statusCode: 409 });
    assert.equal(db.bindings(), 0);
  }
});

test('准备方案不能关联给其他准备任务或其他年度', () => {
  const draft = { ...buildPreparationDraft(task, annual, patient, template, actor), createdAt: '2026-09-19' };
  assert.equal(eligibleCheckupPlan(draft, task, annual), true);
  assert.equal(eligibleCheckupPlan(draft, { ...task, _id: 'other' }, annual), false);
  assert.equal(eligibleCheckupPlan(draft, task, { ...annual, _id: 'other' }), false);
});

test('客户确认及报告回传的独立准备方案不查询/启动任何旧体检服务', async t => {
  const HealthPlan = require('../src/models/HealthPlan');
  const { onCustomerConfirmedCheckupPlan, onCheckupReportAudited } = require('../src/utils/checkupOneStopFlow');
  t.mock.method(HealthPlan, 'findOne', () => assert.fail('准备确认不能回退匹配旧服务'));
  assert.equal(await onCustomerConfirmedCheckupPlan({ _id: 'plan', patientId: 'patient', preparationTaskId: 'task', content: { serviceInstanceId: 'old-service' } }), null);
  t.mock.method(HealthPlan, 'findOne', async () => ({ preparationTaskId: 'task' }));
  assert.equal(await onCheckupReportAudited({ user: 'patient', planId: 'plan' }), false);
});

async function customerConfirm(plan) {
  const fs = require('node:fs'); const vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../src/routes/user'), 'utf8');
  const start = source.indexOf("router.patch('/plans/:planId/confirm'");
  const end = source.indexOf('// PATCH /api/user/plans/:planId/items/', start);
  let handler; let saves = 0; let starts = 0;
  plan.save = async () => { saves++; };
  vm.runInNewContext(source.slice(start, end), { router: { patch: (path, auth, fn) => { handler = fn; } }, auth: () => {},
    HealthPlan: { findOne: async query => { assert.equal(query.patientId, 'patient'); return plan; } },
    onCustomerConfirmedCheckupPlan: async row => { if (!row.preparationTaskId) starts++; },
    generateHealthPlanFollowUp: async () => assert.fail('体检不额外创建普通随访'),
  });
  const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { planId: 'plan' }, user: { _id: 'patient' } }, response);
  return { response, saves, starts };
}

test('客户端不能确认未发布或未审核的准备草稿', async () => {
  for (const patch of [{ status: 'draft', pushedAt: null }, { status: 'active', pushedAt: '2026-09-19', content: { aiStatus: 'pending' } }]) {
    const result = await customerConfirm({ type: 'annual_checkup', preparationTaskId: 'task', content: { aiStatus: 'approved' }, ...patch });
    assert.equal(result.response.code, 409); assert.equal(result.saves, 0); assert.equal(result.starts, 0);
  }
});

test('已审核发布的准备方案仅确认方案；旧体检确认仍进入原链路', async () => {
  const base = { type: 'annual_checkup', status: 'active', pushedAt: '2026-09-19', content: { aiStatus: 'approved' } };
  const prepared = await customerConfirm({ ...base, preparationTaskId: 'task' });
  assert.equal(prepared.response.code, 200); assert.equal(prepared.saves, 1); assert.equal(prepared.starts, 0);
  const legacy = await customerConfirm({ ...base });
  assert.equal(legacy.response.code, 200); assert.equal(legacy.starts, 1);
});
