const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const annualNutrition = require('../../shared/annualNutrition.cjs');
const { WORKFLOW_KEY, ensureForRequest, startForNutritionist, syncRequestFromInterview } = require('../src/utils/nutritionLifestyleTask');

test('年度、单次需求和营养师主动发起都归入生活方式访谈任务', async t => {
  const FollowUp = require('../src/models/FollowUp');
  const Request = require('../src/models/NutritionAssessmentRequest');
  const User = require('../src/models/User');
  const ids = Object.fromEntries(['tenant', 'patient', 'nutritionist', 'request'].map(key => [key, new mongoose.Types.ObjectId()]));
  const row = { _id: ids.request, tenantId: ids.tenant, patientId: ids.patient,
    nutritionistId: ids.nutritionist, status: 'booked', assessmentType: 'initial',
    reason: '核实膳食与生活方式', appointment: { at: new Date('2099-01-01T10:00:00Z') }, formData: {} };
  const user = { _id: ids.patient, tenantId: ids.tenant, assignedNutritionist: ids.nutritionist };
  let linkedTask = null, requestLink = null, selfTask = null;
  const chain = value => ({ select() { return this }, sort() { return this }, lean: async () => value });
  t.mock.method(User, 'findOne', () => chain(user));
  t.mock.method(FollowUp, 'findById', () => chain(linkedTask));
  t.mock.method(FollowUp, 'updateOne', async (_filter, update) => {
    linkedTask ||= { ...update.$setOnInsert, updatedAt: new Date('2026-10-30T00:00:00Z') };
    return { upsertedCount: 1 };
  });
  t.mock.method(Request, 'updateOne', async (_filter, update) => {
    requestLink = update.$set.executionFollowUpId; return { modifiedCount: 1 };
  });
  t.mock.method(FollowUp, 'findOne', () => chain(selfTask));
  t.mock.method(FollowUp, 'create', async data => {
    selfTask = { _id: new mongoose.Types.ObjectId(), ...data }; return selfTask;
  });

  const fromRequest = await ensureForRequest(row);
  assert.equal(fromRequest.workflowKey, WORKFLOW_KEY);
  assert.equal(String(fromRequest.sourceId), String(ids.request));
  assert.equal(String(requestLink), String(fromRequest._id));
  assert.equal(String((await ensureForRequest(row))._id), String(fromRequest._id));
  const own = await startForNutritionist(String(ids.patient), { _id: ids.nutritionist, tenantId: ids.tenant });
  assert.equal(own.workflowKey, WORKFLOW_KEY);
  assert.equal(own.sourceId, undefined);
  assert.equal(String((await startForNutritionist(String(ids.patient), { _id: ids.nutritionist, tenantId: ids.tenant }))._id), String(own._id));
  assert(annualNutrition.isTask({ sourceType: 'scheduled', workflowKey: 'annual_nutrition_assessment', sourceAnnualPlanId: ids.request }));
  assert(annualNutrition.isTask(fromRequest));
  assert(annualNutrition.isTask(own));
});

test('访谈完成后回写关联需求单，保留访谈结果和来源', async t => {
  const Request = require('../src/models/NutritionAssessmentRequest');
  const id = new mongoose.Types.ObjectId(), taskId = new mongoose.Types.ObjectId(), tenantId = new mongoose.Types.ObjectId();
  let row = { _id: id, tenantId, status: 'booked', sourceOrderId: null };
  t.mock.method(Request, 'findOne', () => ({ lean: async () => row }));
  t.mock.method(Request, 'findOneAndUpdate', (_filter, update) => {
    row = { ...row, ...update.$set, events: [...(row.events || []), update.$push.events] };
    return { lean: async () => row };
  });
  const interview = { phase: 'submitted', by: new mongoose.Types.ObjectId(), byName: '营养师',
    notes: '注意早餐规律', questionnaireId: new mongoose.Types.ObjectId(),
    submissionId: new mongoose.Types.ObjectId(), verified: { breakfast: '08:00' },
    pending: [], method: '电话访谈' };
  const task = { _id: taskId, tenantId, sourceId: id, workflowKey: WORKFLOW_KEY,
    status: 'completed', executedContent: '生活方式访谈评估', completedAt: new Date(),
    formData: { lifestyleInterview: interview } };
  assert.deepEqual(await syncRequestFromInterview(task), { status: 'completed' });
  assert.equal(row.status, 'completed');
  assert.equal(String(row.executionFollowUpId), String(taskId));
  assert.equal(row.assessment.details.lifestyleInterview.verified.breakfast, '08:00');
  assert.equal(row.events.length, 1);
  assert.deepEqual(await syncRequestFromInterview(task), { status: 'completed' });
  assert.equal(row.events.length, 1);
});
