const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { buildTask, taskId, dispatch } = require('../src/utils/annualNutritionDispatch');
const { withoutSeparatelyDispatchedNutrition } = require('../src/utils/annualPlanFollowUps');
const { isTask } = require('../../shared/annualNutrition.cjs');

test('年度草稿可单独形成内部营养师任务，保留指标快照且重试使用相同任务 ID', () => {
  const planId = new mongoose.Types.ObjectId();
  const patientId = new mongoose.Types.ObjectId();
  const nutritionistId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const plan = { _id: planId, year: 2026, moduleData: { nutrition_assessment: {
    nutritionComparisonMetrics: ['体重', '空腹血糖', '睡眠质量'], executionDate: '2026-10-20' } } };
  const patient = { _id: patientId, assignedNutritionist: nutritionistId };
  const first = buildTask(plan, patient, { _id: actorId });
  assert.equal(String(first._id), String(taskId(planId)));
  assert.equal(first.sourceType, 'professional_assessment');
  assert.equal(first.taskRole, 'executor');
  assert.equal(String(first.assignedTo), String(nutritionistId));
  assert.deepEqual(first.formData.annualNutritionMetrics, ['体重', '空腹血糖', '睡眠质量']);
  assert.equal(isTask(first), true);
  assert.equal(String(buildTask(plan, patient, { _id: actorId })._id), String(first._id));
  assert.notEqual(String(taskId(planId, 2)), String(first._id));
});

test('单独任务存在时年度确认不再生成第二条营养评估，其他年度事项照常派发', async () => {
  const rows = [{ workflowKey: 'annual_nutrition_assessment' }, { workflowKey: 'annual_checkup' }];
  const found = { exists: async query => {
    assert.equal(query.sourceType, 'professional_assessment');
    assert.equal(query.status.$ne, 'cancelled');
    return { _id: 'existing' };
  } };
  assert.deepEqual(await withoutSeparatelyDispatchedNutrition(rows, 'plan', found), [rows[1]]);
  assert.deepEqual(await withoutSeparatelyDispatchedNutrition(rows, 'plan', { exists: async () => null }), rows);
});

test('重复点击派发复用同一任务；取消后再次派发保留旧任务并创建新任务', async () => {
  const plan = { _id: new mongoose.Types.ObjectId(), year: 2026,
    moduleData: { nutrition_assessment: { nutritionComparisonMetrics: ['体重'] } } };
  const patient = { _id: new mongoose.Types.ObjectId(), assignedNutritionist: new mongoose.Types.ObjectId() };
  const actor = { _id: new mongoose.Types.ObjectId() };
  const rows = new Map();
  const FollowUp = {
    findOne: () => ({ sort: () => ({ lean: async () => [...rows.values()].find(row => row.status !== 'cancelled') || null }) }),
    countDocuments: async () => [...rows.values()].filter(row => row.status === 'cancelled').length,
    updateOne: async (filter, update) => {
      const key = String(filter._id);
      if (rows.has(key)) return { upsertedCount: 0 };
      rows.set(key, { ...update.$setOnInsert });
      return { upsertedCount: 1 };
    },
    findById: id => ({ lean: async () => rows.get(String(id)) }),
  };
  const first = await dispatch(plan, patient, actor, FollowUp);
  const second = await dispatch(plan, patient, actor, FollowUp);
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(String(first.task._id), String(second.task._id));
  first.task.status = 'cancelled';
  const third = await dispatch(plan, patient, actor, FollowUp);
  assert.equal(third.reused, false);
  assert.notEqual(String(third.task._id), String(first.task._id));
  assert.equal(rows.size, 2);
});
