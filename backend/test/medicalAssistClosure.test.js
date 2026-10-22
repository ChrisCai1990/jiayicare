const test = require('node:test');
const assert = require('node:assert/strict');
const FollowUp = require('../src/models/FollowUp');
const HealthPlan = require('../src/models/HealthPlan');
const Order = require('../src/models/Order');
const User = require('../src/models/User');
const CareFlow = require('../src/models/CareFlow');
const MedicalReport = require('../src/models/MedicalReport');
const Medication = require('../src/models/Medication');
const medicalProxyWorkflow = require('../src/utils/medicalProxyWorkflow');
const closure = require('../src/utils/medicalAssistClosure');

test('all order endings queue one planner closure action without completing the order', async () => {
  const previous = { user: User.findById, task: FollowUp.findOneAndUpdate, taskUpdate: FollowUp.updateMany,
    exists: FollowUp.exists, plans: HealthPlan.find, order: Order.updateOne };
  const calls = [];
  try {
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner' }) }) });
    FollowUp.exists = async () => false;
    HealthPlan.find = () => ({ select: () => ({ lean: async () => [] }) });
    FollowUp.findOneAndUpdate = async (query, update) => { calls.push({ query, update }); return { _id: 'closure' }; };
    FollowUp.updateMany = async () => ({ modifiedCount: 0 });
    Order.updateOne = async (query, update) => { calls.push({ query, update }); return { modifiedCount: 1 }; };
    await closure.requestOrderClosure({ _id: 'order', user: 'patient', tenantId: 'tenant', serviceName: '专家约诊', status: 'scheduled' });
    assert.equal(calls[0].query.workflowKey, closure.KEY);
    assert.equal(calls[0].update.$setOnInsert.tenantId, 'tenant');
    assert.deepEqual(calls[0].update.$setOnInsert.formData, {});
    assert.equal(calls[0].update.$set.assignedTo, 'planner');
    assert.equal(calls[1].update.$set.supervisionStatus, 'pending_closure');
    assert.equal(calls[1].update.$set.currentStage, 'pending_closure');
    assert.equal(calls[1].update.$set.status, undefined);
  } finally { User.findById = previous.user; FollowUp.findOneAndUpdate = previous.task; FollowUp.updateMany = previous.taskUpdate;
    FollowUp.exists = previous.exists; HealthPlan.find = previous.plans; Order.updateOne = previous.order; }
});

test('postvisit order waits for advisor, report, and medication reviews before planner closure', async () => {
  const previous = { user: User.findById, exists: FollowUp.exists, audit: FollowUp.findOne,
    reports: MedicalReport.exists, medications: Medication.exists, plans: HealthPlan.find,
    task: FollowUp.findOneAndUpdate, taskUpdate: FollowUp.updateMany, order: Order.updateOne };
  let approved = false; let reportPending = false; let medicationPending = false;
  const queued = [];
  try {
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner' }) }) });
    FollowUp.exists = async query => query.workflowKey === 'medical_proxy:post_visit_audit' ? true
      : !!query.sourceScheduleKey && approved;
    FollowUp.findOne = () => ({ select: () => ({ lean: async () => ({ formData: { reportIds: ['report-1'] } }) }) });
    MedicalReport.exists = async () => reportPending;
    Medication.exists = async () => medicationPending;
    HealthPlan.find = () => ({ select: () => ({ lean: async () => [] }) });
    FollowUp.findOneAndUpdate = async query => { queued.push(query); return {}; };
    FollowUp.updateMany = async () => ({});
    Order.updateOne = async () => ({});
    const order = { _id: 'order-1', user: 'patient', serviceName: '陪同看诊服务', status: 'scheduled' };
    assert.deepEqual(await closure.requestOrderClosure(order), { pending: false });
    approved = true; reportPending = true;
    assert.deepEqual(await closure.requestOrderClosure(order), { pending: false });
    reportPending = false; medicationPending = true;
    assert.deepEqual(await closure.requestOrderClosure(order), { pending: false });
    medicationPending = false;
    await closure.requestOrderClosure(order);
    assert.equal(queued.length, 1);
    assert.equal(queued[0].workflowKey, closure.KEY);
  } finally {
    User.findById = previous.user; FollowUp.exists = previous.exists; FollowUp.findOne = previous.audit;
    MedicalReport.exists = previous.reports; Medication.exists = previous.medications; HealthPlan.find = previous.plans;
    FollowUp.findOneAndUpdate = previous.task; FollowUp.updateMany = previous.taskUpdate; Order.updateOne = previous.order;
  }
});

test('planner cannot confirm an already queued closure while advisor review is pending', async () => {
  const previous = { task: FollowUp.findOne, exists: FollowUp.exists };
  try {
    FollowUp.findOne = async () => ({ _id: 'closure', sourceType: 'order', sourceOrderId: 'order-1',
      workflowKey: closure.KEY, assignedTo: 'planner', status: 'planned' });
    FollowUp.exists = async query => query.workflowKey === 'medical_proxy:post_visit_audit';
    await assert.rejects(closure.confirmClosure('closure', { _id: 'planner', role: 'healthPlanner' }, '已核对'),
      /健康顾问尚未通过/);
  } finally { FollowUp.findOne = previous.task; FollowUp.exists = previous.exists; }
});

test('planner confirmation rejects unfinished execution and records actual reviewer', async () => {
  const previous = { task: FollowUp.findOne, exists: FollowUp.exists, update: FollowUp.updateOne, updateMany: FollowUp.updateMany,
    plans: HealthPlan.find, plansUpdate: HealthPlan.updateMany, order: Order.findOneAndUpdate, orderUpdate: Order.updateOne, settle: medicalProxyWorkflow.settleCompletedMedicalOrder };
  const task = { _id: 'closure', sourceType: 'order', sourceOrderId: 'order', workflowKey: closure.KEY, assignedTo: 'planner', status: 'planned', formData: null };
  const writes = [];
  try {
    FollowUp.findOne = async () => task;
    FollowUp.exists = async () => true;
    await assert.rejects(closure.confirmClosure('closure', { _id: 'planner', role: 'healthPlanner' }, '资料齐全'), /仍有执行环节/);
    FollowUp.exists = async () => false;
    HealthPlan.find = () => ({ select: () => ({ lean: async () => [] }) });
    HealthPlan.updateMany = async () => ({ modifiedCount: 0 });
    Order.findOneAndUpdate = async (query, update) => { writes.push(update.$set); return { _id: 'order', status: 'completed' }; };
    Order.updateOne = async () => ({ modifiedCount: 1 });
    medicalProxyWorkflow.settleCompletedMedicalOrder = async () => {};
    FollowUp.updateOne = async (query, update) => { writes.push(update.$set); return { modifiedCount: 1 }; };
    FollowUp.updateMany = async () => ({ modifiedCount: 0 });
    await closure.confirmClosure('closure', { _id: 'planner', role: 'healthPlanner' }, '资料齐全，已告知客户');
    assert.equal(writes[0].supervisionStatus, 'completed');
    assert.equal(writes[1].formData.closureConfirmedBy, 'planner');
    assert.ok(writes[1].formData.closureConfirmedAt instanceof Date);
    assert.equal(writes[1].executedContent, '资料齐全，已告知客户');
  } finally {
    FollowUp.findOne = previous.task; FollowUp.exists = previous.exists; FollowUp.updateOne = previous.update;
    FollowUp.updateMany = previous.updateMany; HealthPlan.find = previous.plans; HealthPlan.updateMany = previous.plansUpdate; Order.findOneAndUpdate = previous.order; Order.updateOne = previous.orderUpdate;
    medicalProxyWorkflow.settleCompletedMedicalOrder = previous.settle;
  }
});

test('a completed order can resume an interrupted planner closure', async () => {
  const previous = { task: FollowUp.findOne, exists: FollowUp.exists, update: FollowUp.updateOne, updateMany: FollowUp.updateMany,
    plans: HealthPlan.find, plansUpdate: HealthPlan.updateMany, order: Order.findOneAndUpdate, orderFind: Order.findOne,
    orderUpdate: Order.updateOne, settle: medicalProxyWorkflow.settleCompletedMedicalOrder };
  const writes = [];
  try {
    FollowUp.findOne = async () => ({ _id: 'closure', sourceType: 'order', sourceOrderId: 'order', workflowKey: closure.KEY,
      assignedTo: 'planner', status: 'planned', formData: null });
    FollowUp.exists = async () => false;
    HealthPlan.find = () => ({ select: () => ({ lean: async () => [] }) });
    HealthPlan.updateMany = async () => ({ modifiedCount: 0 });
    Order.findOneAndUpdate = async () => null;
    Order.findOne = async () => ({ _id: 'order', status: 'completed', supervisionStatus: 'completed', totalUnits: 1 });
    Order.updateOne = async () => ({ modifiedCount: 1 });
    medicalProxyWorkflow.settleCompletedMedicalOrder = async () => {};
    FollowUp.updateOne = async (query, update) => { writes.push(update.$set); return { modifiedCount: 1 }; };
    FollowUp.updateMany = async () => ({ modifiedCount: 0 });
    await closure.confirmClosure('closure', { _id: 'planner', role: 'healthPlanner' }, '已完成就医');
    assert.equal(writes[0].status, 'completed');
    assert.equal(writes[0].formData.closureConfirmedBy, 'planner');
  } finally {
    FollowUp.findOne = previous.task; FollowUp.exists = previous.exists; FollowUp.updateOne = previous.update;
    FollowUp.updateMany = previous.updateMany; HealthPlan.find = previous.plans; HealthPlan.updateMany = previous.plansUpdate;
    Order.findOneAndUpdate = previous.order; Order.findOne = previous.orderFind; Order.updateOne = previous.orderUpdate;
    medicalProxyWorkflow.settleCompletedMedicalOrder = previous.settle;
  }
});

test('multi-unit plan waits for its planner without closing the whole order', async () => {
  const previous = { user: User.findById, order: Order.findById, exists: FollowUp.exists,
    task: FollowUp.findOneAndUpdate, plan: HealthPlan.updateOne };
  const writes = [];
  try {
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner' }) }) });
    Order.findById = () => ({ select: () => ({ lean: async () => ({ totalUnits: 4, status: 'scheduled' }) }) });
    FollowUp.exists = async () => false;
    FollowUp.findOneAndUpdate = async (query, update) => { writes.push({ query, update }); return {}; };
    HealthPlan.updateOne = async (query, update) => { writes.push({ query, update }); return { modifiedCount: 1 }; };
    await closure.requestPlanClosure({ _id: 'plan', patientId: 'patient', type: 'medical_assist', status: 'active', sourceOrderId: 'order', title: '陪诊' });
    assert.equal(writes[0].query.sourceHealthPlanId, 'plan');
    assert.equal(writes[1].update.$set.supervisionStatus, 'pending_closure');
    assert.equal(writes[1].update.$set.status, 'active');
  } finally {
    User.findById = previous.user; Order.findById = previous.order; FollowUp.exists = previous.exists;
    FollowUp.findOneAndUpdate = previous.task; HealthPlan.updateOne = previous.plan;
  }
});

test('annual medical-assist flow finalizes only when its planner confirms', async () => {
  const previous = { task: FollowUp.findOne, exists: FollowUp.exists, update: FollowUp.updateOne,
    updateMany: FollowUp.updateMany, flow: CareFlow.findOneAndUpdate };
  const writes = [];
  try {
    FollowUp.findOne = async () => ({ _id: 'closure', careFlowId: 'flow', workflowKey: closure.KEY,
      assignedTo: 'planner', status: 'planned' });
    FollowUp.exists = async () => false;
    CareFlow.findOneAndUpdate = async (query, update) => { writes.push(update.$set); return { _id: 'flow' }; };
    FollowUp.updateOne = async (query, update) => { writes.push(update.$set); return { modifiedCount: 1 }; };
    FollowUp.updateMany = async () => ({ modifiedCount: 0 });
    await closure.confirmClosure('closure', { _id: 'planner', role: 'healthPlanner' }, '已核对服务结果');
    assert.equal(writes[0]['state.finalized'], true);
    assert.equal(writes.at(-1).formData.closureConfirmedBy, 'planner');
  } finally {
    FollowUp.findOne = previous.task; FollowUp.exists = previous.exists; FollowUp.updateOne = previous.update;
    FollowUp.updateMany = previous.updateMany; CareFlow.findOneAndUpdate = previous.flow;
  }
});

test('planner workbench recovers an open read-only order after every executor ended', async () => {
  const previous = { tasks: FollowUp.find, exists: FollowUp.exists, upsert: FollowUp.findOneAndUpdate,
    taskUpdate: FollowUp.updateMany, orders: Order.findById, orderUpdate: Order.updateOne,
    plans: HealthPlan.find, flows: CareFlow.find, user: User.findById };
  const queued = [];
  try {
    FollowUp.find = query => ({ select: () => {
      const rows = query.workflowKey === closure.KEY ? [] : [{ _id: 'supervisor', sourceType: 'order', sourceOrderId: 'order', workflowKey: 'medical_proxy:supervise' }];
      return { lean: async () => rows, limit: () => ({ lean: async () => rows }) };
    } });
    FollowUp.exists = async query => query.status === 'completed' && query.workflowKey !== 'medical_proxy:post_visit_audit';
    FollowUp.findOneAndUpdate = async (query, update) => { queued.push({ query, update }); return {}; };
    FollowUp.updateMany = async () => ({ modifiedCount: 0 });
    Order.findById = () => ({ select: () => ({ lean: async () => ({ _id: 'order', user: 'patient', status: 'scheduled', serviceName: '专家约诊' }) }) });
    Order.updateOne = async () => ({ modifiedCount: 1 });
    HealthPlan.find = () => ({ select: () => ({ lean: async () => [], limit: () => ({ lean: async () => [] }) }) });
    CareFlow.find = () => ({ limit: () => ({ lean: async () => [] }) });
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner' }) }) });
    assert.equal(await closure.reconcilePendingClosuresForPlanner({ _id: 'planner-reconcile-test', role: 'healthPlanner' }), 1);
    assert.equal(queued[0].query.workflowKey, closure.KEY);
  } finally {
    FollowUp.find = previous.tasks; FollowUp.exists = previous.exists; FollowUp.findOneAndUpdate = previous.upsert;
    FollowUp.updateMany = previous.taskUpdate; Order.findById = previous.orders; Order.updateOne = previous.orderUpdate;
    HealthPlan.find = previous.plans; CareFlow.find = previous.flows; User.findById = previous.user;
  }
});

test('planner workbench restores a closure cancelled after an interrupted confirmation', async () => {
  const previous = { tasks: FollowUp.find, update: FollowUp.updateOne, plans: HealthPlan.find,
    flows: CareFlow.find, order: Order.findById };
  const writes = [];
  try {
    FollowUp.find = query => ({ select: () => ({ limit: () => ({ lean: async () => query.status === 'cancelled'
      ? [{ _id: 'closure', sourceOrderId: 'order' }] : [] }), lean: async () => [] }) });
    FollowUp.updateOne = async (query, update) => { writes.push({ query, update }); return { modifiedCount: 1 }; };
    Order.findById = () => ({ select: () => ({ lean: async () => ({ status: 'completed', tradeStatus: 'completed', supervisionStatus: 'completed' }) }) });
    HealthPlan.find = () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
    CareFlow.find = () => ({ limit: () => ({ lean: async () => [] }) });
    await closure.reconcilePendingClosuresForPlanner({ _id: 'planner-interrupted-closure-test', role: 'healthPlanner' });
    assert.equal(writes[0].query._id, 'closure');
    assert.equal(writes[0].update.$set.status, 'planned');
  } finally {
    FollowUp.find = previous.tasks; FollowUp.updateOne = previous.update;
    HealthPlan.find = previous.plans; CareFlow.find = previous.flows; Order.findById = previous.order;
  }
});
