const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const PlanTemplate = require('../src/models/PlanTemplate');
const Draft = require('../src/models/NutritionInterventionDraft');
const Task = require('../src/models/Task');
const FollowUp = require('../src/models/FollowUp');
const workflow = require('../src/utils/nutritionInterventionTasks');

const oid = () => new mongoose.Types.ObjectId();
const query = value => ({ select: () => ({ lean: async () => value }), lean: async () => value });

test('AI action drafts require concrete actions and review evidence', () => {
  assert.throws(() => workflow.parseActions('{"actions":[]}'), /1至6条/);
  assert.throws(() => workflow.parseActions('{"actions":[{"title":"喝水","instruction":"记录饮水"}]}'), /观察依据/);
  assert.deepEqual(workflow.parseActions('{"actions":[{"title":"记录饮水","instruction":"按方案记录","frequency":"每周","evidence":"饮水记录"}]}')[0], {
    key: 'action-1', title: '记录饮水', instruction: '按方案记录', frequency: '每周', evidence: '饮水记录',
  });
});

test('publishing a reviewed nutrition draft writes deterministic customer and staged staff tasks', async t => {
  const patientId = oid(); const planId = oid(); const templateId = oid();
  const manager = oid(); const nutritionist = oid(); const advisor = oid();
  const patient = { _id: patientId, tenantId: null, lifestyle_data: { diet: '已核实的三餐记录' }, lifestyleHistory: [{ recordedById: nutritionist, changes: { lifestyle_data: { diet: { to: '已核实的三餐记录' } } } }],
    assignedHealthManager: manager, assignedNutritionist: nutritionist, assignedFamilyDoctor: advisor };
  t.mock.method(User, 'findById', () => query(patient));
  t.mock.method(Admin, 'find', () => query([
    { _id: manager, role: 'healthManager', tenantId: null },
    { _id: nutritionist, role: 'nutritionist', tenantId: null },
    { _id: advisor, role: 'familyDoctor', tenantId: null },
  ]));
  t.mock.method(PlanTemplate, 'findOne', () => query({ _id: templateId, type: 'nutrition', name: '营养模板', content: { dietPrinciple: '按模板' } }));
  const plan = { _id: planId, patientId, type: 'nutrition', title: '营养方案', content: {
    nutritionTaskVersion: 1, goal: '改善膳食执行', nutritionReviewDate: '2099-12-01', templateId,
    nutritionTargets: [{ metric: '骨骼肌', baseline: '24 kg', target: '维持24 kg' },
      { metric: '体脂率', baseline: '32%', target: '31%' },
      { metric: '内脏脂肪', baseline: '9级', target: '8级' }],
    moduleData: { breakfast: { content: '按模板早餐' } },
  } };
  const input = await workflow.inputFor(plan);
  const draft = { _id: planId, status: 'pending_review', sourceFingerprint: input.sourceFingerprint,
    reviewDate: input.reviewDate, actions: [{ key: 'action-1', title: '记录早餐', instruction: '记录实际早餐', frequency: '每周', evidence: '早餐记录' }] };
  const customerWrites = []; const staffWrites = [];
  t.mock.method(Draft, 'findOneAndUpdate', async () => ({ ...draft, status: 'publishing' }));
  t.mock.method(Draft, 'findById', () => query({ ...draft, status: 'published' }));
  t.mock.method(Draft, 'updateOne', async () => ({}));
  t.mock.method(Task, 'updateOne', async (...args) => { customerWrites.push(args); return {}; });
  t.mock.method(FollowUp, 'updateOne', async (...args) => { staffWrites.push(args); return {}; });

  await workflow.publish(plan, draft, { _id: nutritionist }, draft.actions);
  assert.equal(customerWrites.length, 1);
  assert.equal(staffWrites.length, 3);
  assert.deepEqual(staffWrites.map(args => args[1].$setOnInsert.assignedTo.toString()), [manager, nutritionist, advisor].map(String));
  assert.deepEqual(staffWrites.map(args => args[1].$setOnInsert.isBlocked), [false, true, true]);
  assert.equal(String(staffWrites[1][1].$setOnInsert.dependsOnTaskId), String(staffWrites[0][0]._id));
  assert.equal(String(staffWrites[2][1].$setOnInsert.dependsOnTaskId), String(staffWrites[1][0]._id));
  assert.equal(customerWrites[0][2].upsert, true);
  assert.equal(staffWrites[0][2].upsert, true);
});
