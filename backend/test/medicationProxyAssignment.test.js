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

test('planner must assign the medical assistant before sending a new order onward', async () => {
  const h = harness();
  const task = { sourceType: 'order', workflowKey: 'medication_proxy:intake', patientId: 'member', assignedTo: 'planner' };
  assert.match(await h.validate(task, { status: 'completed', formData: { ...intake } }, { _id: 'planner' }), /健康规划师先指定/);
  assert.equal(await h.validate(task, { status: 'completed', formData: { ...intake, medicalAssistantId: 'assistant' } }, { _id: 'planner' }), '');
});

test('booking preserves the planner assignment and hands off directly to the assistant', async () => {
  const h = harness();
  const assignedIntake = { ...intake, medicalAssistantId: 'assistant', medicalAssistantName: '执行人员' };
  const booking = { ...assignedIntake, intakeSnapshot: assignedIntake, appointmentDate: '2026-10-01', appointmentTime: '10:00' };
  const task = { sourceType: 'order', workflowKey: 'medication_proxy:booking', sourceOrderId: 'order', patientId: 'member', assignedTo: 'manager', status: 'completed', _id: 'booking', formData: booking };
  const submitted = { ...booking, medicalAssistantId: 'other', intakeSnapshot: { ...booking.intakeSnapshot, medicalAssistantId: 'other' } };
  assert.equal(await h.validate(task, { status: 'completed', formData: submitted }, { _id: 'manager' }), '');
  assert.equal(submitted.medicalAssistantId, 'assistant');
  assert.equal(submitted.intakeSnapshot.medicalAssistantId, 'assistant');
  task.formData = submitted;
  await h.advance(task);
  assert.equal(h.created[0].stage, 'medication_proxy:execute');
  assert.equal(h.created[0].assignee, 'assistant');
});

test('already assigned pharmacy or online orders go straight to execution; old unassigned bookings retain a recovery path', async () => {
  const preassigned = harness();
  const online = { ...intake, institutionType: 'online', platformName: '平台A', medicalAssistantId: 'assistant' };
  await preassigned.advance({ sourceType: 'order', workflowKey: 'medication_proxy:intake', sourceOrderId: 'order', patientId: 'member', status: 'completed', _id: 'intake', formData: online });
  assert.equal(preassigned.created.at(-1).stage, 'medication_proxy:execute');
  assert.equal(preassigned.created.at(-1).assignee, 'assistant');

  const legacy = harness();
  await legacy.advance({ sourceType: 'order', workflowKey: 'medication_proxy:booking', sourceOrderId: 'order', patientId: 'member', status: 'completed', _id: 'booking', formData: { ...intake, intakeSnapshot: intake } });
  assert.equal(legacy.created[0].stage, 'medication_proxy:planner');
  assert.equal(legacy.created[0].assignee, 'planner');
});
