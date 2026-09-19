const test = require('node:test');
const assert = require('node:assert/strict');
const { publishAssessmentFollowUps } = require('../src/utils/dynamicAssessmentFollowUps');
const { validateAssessmentFollowUpDrafts } = require('../src/utils/assessmentFollowUpDrafts');

const draft = { title: '核对报告', content: '核对专科评估要求补充的报告', date: '2026-10-01', category: 'information', requiresService: false };
const assessment = (drafts = [draft]) => ({ _id: 'assessment', patientId: 'patient', status: 'approved', advisorReviewedBy: 'original-advisor', followUpDrafts: drafts });
function fixture(patient = { _id: 'patient', assignedHealthManager: 'manager', assignedHealthPlanner: 'planner' }) {
  const rows = new Map();
  let failAt = 0;
  let calls = 0;
  return {
    rows,
    failOn: call => { failAt = call; },
    User: { findById: () => ({ select: () => ({ lean: async () => patient }) }) },
    FollowUp: {
      exists: async query => rows.has(query.assessmentActionKey),
      updateOne: async (query, update) => {
        if (++calls === failAt) throw new Error('database temporarily unavailable');
        if (rows.has(query.assessmentActionKey)) return { upsertedCount: 0 };
        rows.set(query.assessmentActionKey, { ...update.$setOnInsert });
        return { upsertedCount: 1 };
      },
    },
  };
}

test('未经终审不创建任何正式任务', async () => {
  const models = fixture();
  await assert.rejects(publishAssessmentFollowUps({ ...assessment(), status: 'advisor_review' }, { _id: 'advisor' }, models), /未经/);
  assert.equal(models.rows.size, 0);
});

test('普通随访归健管专员；有服务需求才产生规划师任务并关联同一事项', async () => {
  const models = fixture();
  const result = await publishAssessmentFollowUps(assessment([draft, { ...draft, requiresService: true }]), { _id: 'advisor' }, models);
  assert.equal(result.created, 3);
  const tasks = [...models.rows.values()];
  assert.deepEqual(tasks.map(row => row.assignedTo), ['manager', 'manager', 'planner']);
  assert.equal(tasks[0].taskRole, '');
  assert.equal(tasks[2].taskRole, 'supervisor');
  assert.equal(tasks[1].coordinationGroupId, tasks[2].coordinationGroupId);
  assert.equal(tasks[2].formData.linkedFollowUpActionKey, tasks[1].assessmentActionKey);
  assert.equal(tasks[2].formData.approvedBy, 'original-advisor');
});

test('发布到一半失败后可重试补齐，保留已完成任务且不重复', async () => {
  const models = fixture();
  models.failOn(2);
  const row = assessment([{ ...draft, requiresService: true }, draft]);
  await assert.rejects(publishAssessmentFollowUps(row, { _id: 'advisor' }, models));
  assert.equal(models.rows.size, 1);
  [...models.rows.values()][0].status = 'completed';
  const result = await publishAssessmentFollowUps(row, { _id: 'advisor' }, models);
  assert.equal(result.created, 2);
  assert.equal(models.rows.size, 3);
  assert.equal([...models.rows.values()][0].status, 'completed');
  assert.equal((await publishAssessmentFollowUps(row, { _id: 'advisor' }, models)).created, 0);
});

test('缺失任一必要负责人时明确失败，不生成无人的任务', async () => {
  for (const patient of [{ _id: 'patient' }, { _id: 'patient', assignedHealthManager: 'manager' }]) {
    const models = fixture(patient);
    await assert.rejects(publishAssessmentFollowUps(assessment([{ ...draft, requiresService: true }]), { _id: 'advisor' }, models), /尚未绑定/);
    assert.equal(models.rows.size, 0);
  }
});

test('空列表不需要分配人员，也不增加任务', async () => {
  assert.equal((await publishAssessmentFollowUps(assessment([]), { _id: 'advisor' })).created, 0);
});

test('非法日期或不完整草稿必须报错，不能静默丢弃', () => {
  for (const patch of [{ date: '2026-02-30' }, { date: 'not-a-date' }, { content: '' }, { title: {} }, { category: 'prescription' }]) {
    assert.throws(() => validateAssessmentFollowUpDrafts([{ ...draft, ...patch }]));
  }
  assert.throws(() => validateAssessmentFollowUpDrafts(undefined));
  assert.equal(validateAssessmentFollowUpDrafts([{ ...draft, date: '2028-02-29' }])[0].date, '2028-02-29');
});

test('并发唯一键冲突仅在目标任务已存在时作为成功处理', async () => {
  const models = fixture();
  const row = assessment();
  await publishAssessmentFollowUps(row, { _id: 'advisor' }, models);
  models.FollowUp.updateOne = async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); };
  assert.equal((await publishAssessmentFollowUps(row, { _id: 'advisor' }, models)).created, 0);
  models.rows.clear();
  await assert.rejects(publishAssessmentFollowUps(row, { _id: 'advisor' }, models), /duplicate/);
});
