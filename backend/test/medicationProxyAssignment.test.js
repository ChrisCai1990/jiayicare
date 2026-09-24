const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const created = [];
  const patient = { assignedHealthPlanner: 'planner', assignedHealthManager: 'manager', assignedFamilyDoctor: 'advisor' };
  const mocks = {
    '../models/Admin': { findOne: query => ({ select: () => ({ lean: async () => query._id === 'assistant' ? { _id: 'assistant', name: '执行人员' } : null }) }) },
    '../models/FollowUp': {
      findOneAndUpdate: async (query, update) => { created.push({ stage: query.workflowKey, assignee: update.$setOnInsert.assignedTo, formData: update.$setOnInsert.formData }); return { _id: 'next-task' }; },
      updateOne: async () => {},
      updateMany: async () => {},
    },
    '../models/Order': { findById: async () => ({ _id: 'order', user: 'member', serviceName: '代配药' }), updateOne: async () => {} },
    '../models/User': { findById: () => ({ select: () => ({ lean: async () => patient }) }) },
    '../models/RecurringSupplyPlan': {},
    './medicationSupplyCalculation': { calculateMedicationSupply: () => ({ dailyUnits: 1, supplyDays: 30 }), numberOf: value => Number.parseFloat(value) },
  };
  const context = { module: { exports: {} }, require: name => mocks[name] };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/medicationProxyWorkflow'), 'utf8'), context);
  return { ...context.module.exports, created };
}

const intake = {
  brandName: '药物A', chemicalName: '成分A', specification: '10片', singleDose: '1', dailyFrequency: '1', totalQuantity: '30',
  institutionType: 'hospital', hospitalName: '医院A', campus: '院区A', department: '内科', paymentMethod: 'self_pay',
};

test('initial intake and hospital booking allow no preselected medical assistant', async () => {
  const h = harness();
  assert.equal(await h.validate({ sourceType: 'order', workflowKey: 'medication_proxy:intake', patientId: 'member', assignedTo: 'planner' }, { status: 'completed', formData: { ...intake } }, { _id: 'planner' }), '');
  assert.equal(await h.validate({ sourceType: 'order', workflowKey: 'medication_proxy:booking', patientId: 'member', assignedTo: 'manager' }, { status: 'completed', formData: { ...intake, appointmentDate: '2026-10-01', appointmentTime: '10:00' } }, { _id: 'manager' }), '');
});

test('unassigned booking goes to planner, who must select an active assistant before execution', async () => {
  const h = harness();
  await h.advance({ sourceType: 'order', workflowKey: 'medication_proxy:booking', sourceOrderId: 'order', patientId: 'member', status: 'completed', _id: 'booking', formData: { ...intake, appointmentDate: '2026-10-01', appointmentTime: '10:00', intakeSnapshot: intake } });
  assert.equal(h.created[0].stage, 'medication_proxy:planner');
  assert.equal(h.created[0].assignee, 'planner');
  const plannerTask = { sourceType: 'order', workflowKey: 'medication_proxy:planner', sourceOrderId: 'order', patientId: 'member', assignedTo: 'planner', status: 'completed', _id: 'planner-task', formData: h.created[0].formData };
  assert.match(await h.validate(plannerTask, { status: 'completed', formData: { ...plannerTask.formData } }, { _id: 'planner' }), /请指定本单就医专员/);
  plannerTask.formData.medicalAssistantId = 'assistant';
  assert.equal(await h.validate(plannerTask, { status: 'completed', formData: plannerTask.formData }, { _id: 'planner' }), '');
  await h.advance(plannerTask);
  assert.equal(h.created[1].stage, 'medication_proxy:execute');
  assert.equal(h.created[1].assignee, 'assistant');
});

test('pharmacy or online orders without an assistant also return to planner; preassigned orders keep the direct route', async () => {
  const unassigned = harness();
  const online = { ...intake, institutionType: 'online', platformName: '平台A' };
  assert.equal(await unassigned.validate({ sourceType: 'order', workflowKey: 'medication_proxy:intake', patientId: 'member', assignedTo: 'planner' }, { status: 'completed', formData: online }, { _id: 'planner' }), '');
  await unassigned.advance({ sourceType: 'order', workflowKey: 'medication_proxy:intake', sourceOrderId: 'order', patientId: 'member', status: 'completed', _id: 'intake', formData: online });
  assert.equal(unassigned.created.at(-1).stage, 'medication_proxy:planner');
  assert.equal(unassigned.created.at(-1).assignee, 'planner');

  const preassigned = harness();
  await preassigned.advance({ sourceType: 'order', workflowKey: 'medication_proxy:booking', sourceOrderId: 'order', patientId: 'member', status: 'completed', _id: 'booking', formData: { ...intake, medicalAssistantId: 'assistant', intakeSnapshot: intake } });
  assert.equal(preassigned.created[0].stage, 'medication_proxy:execute');
  assert.equal(preassigned.created[0].assignee, 'assistant');
});
