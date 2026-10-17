const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Order = require('../src/models/Order');
const FollowUp = require('../src/models/FollowUp');
const User = require('../src/models/User');
const Referral = require('../src/models/Referral');
const Fulfillment = require('../src/models/Fulfillment');
const MedicalExpert = require('../src/models/MedicalExpert');
const MedicalReport = require('../src/models/MedicalReport');
const Admin = require('../src/models/Admin');
const commission = require('../src/utils/commissionSettlement');
const workflow = require('../src/routes/decisionReferral');

const id = () => new mongoose.Types.ObjectId();
const advance = workflow.router.stack.find(layer => layer.route?.path === '/tasks/:id/advance').route.stack.at(-1).handle;
const reportAccess = workflow.router.stack.find(layer => layer.route?.path === '/referrals/:id/reports/:reportId').route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; } });

test('specialist feedback waits for manager booking confirmation', async () => {
  const original = Order.findById;
  const orderId = id(), referralId = id();
  const order = { _id: orderId, serviceName: '企业家健康决策计划', status: 'scheduled',
    tradeStatus: 'paid', paymentStatus: 'paid', refundStatus: 'none',
    decisionReferral: { stage: 'specialist', referralId } };
  try {
    Order.findById = () => ({ select: async () => order });
    await assert.rejects(workflow.validateFeedbackWindow({ _id: referralId, sourceOrderId: orderId }), /预约尚未确认/);
    order.decisionReferral.booking = { confirmedAt: new Date() };
    await workflow.validateFeedbackWindow({ _id: referralId, sourceOrderId: orderId });
  } finally { Order.findById = original; }
});

test('revised specialist feedback returns archived plan to advisor review', async () => {
  const original = { orderFind: Order.findById, orderUpdate: Order.updateOne,
    userFind: User.findById, taskUpdate: FollowUp.updateOne };
  const orderId = id(), referralId = id(), advisor = id(), patientId = id();
  const updated = [];
  try {
    Order.findById = async () => ({ _id: orderId, user: patientId, serviceName: '企业家健康决策计划',
      status: 'scheduled', tradeStatus: 'paid', paymentStatus: 'paid', refundStatus: 'none',
      decisionReferral: { stage: 'planner_final', referralId, archive: { referralFeedbackVersion: 1 } } });
    Order.updateOne = async (filter, update) => { updated.push({ filter, update }); return { modifiedCount: 1 }; };
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedFamilyDoctor: advisor }) }) });
    FollowUp.updateOne = async (filter, update) => { updated.push({ filter, update }); return { modifiedCount: 1 }; };
    await workflow.onReferralFeedback({ _id: referralId, sourceOrderId: orderId, status: 'completed', feedbackVersion: 2 });
    assert.equal(updated[0].update.$set['decisionReferral.stage'], 'advisor_review');
    assert.equal(updated[1].update.$set.status, 'planned');
  } finally {
    Order.findById = original.orderFind; Order.updateOne = original.orderUpdate;
    User.findById = original.userFind; FollowUp.updateOne = original.taskUpdate;
  }
});

test('planner handoff creates one advisor task and keeps decision service open', async () => {
  const original = {
    taskFind: FollowUp.findById, taskUpsert: FollowUp.findOneAndUpdate, taskUpdate: FollowUp.updateOne,
    orderFind: Order.findById, orderUpdate: Order.findOneAndUpdate, userFind: User.findById,
  };
  const planner = id(), advisor = id(), manager = id(), tenant = id(), patientId = id(), orderId = id(), taskId = id();
  const order = { _id: orderId, user: patientId, serviceName: '企业家健康决策计划', status: 'pending',
    tradeStatus: 'paid', paymentStatus: 'paid', refundStatus: 'none', supervisorId: planner, decisionReferral: null };
  const patient = { _id: patientId, tenantId: tenant, assignedFamilyDoctor: advisor,
    assignedHealthManager: manager, assignedHealthPlanner: planner };
  const task = { _id: taskId, sourceType: 'order', sourceOrderId: orderId, patientId, staffId: planner,
    assignedTo: planner, workflowKey: '', status: 'planned' };
  const created = [], completed = [];
  try {
    FollowUp.findById = async () => task;
    FollowUp.findOneAndUpdate = async (_filter, update) => { created.push(update.$setOnInsert); return update.$setOnInsert; };
    FollowUp.updateOne = async (filter, update) => { completed.push({ filter, update }); return { modifiedCount: 1 }; };
    Order.findById = async () => order;
    Order.findOneAndUpdate = async (_filter, update) => ({ ...order, ...update.$set });
    User.findById = () => ({ select: () => ({ lean: async () => patient }) });
    const res = response();
    await advance({ params: { id: String(taskId) }, staff: { _id: planner, role: 'healthPlanner', tenantId: tenant, name: '规划师' },
      body: { intakeNote: '客户希望解析近期体检报告' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.status, 'scheduled');
    assert.equal(res.body.data.decisionReferral.stage, 'advisor');
    assert.equal(String(created[0].assignedTo), String(advisor));
    assert.equal(created[0].workflowKey, 'decision_referral:advisor');
    assert.equal(completed.length, 1);
  assert.equal(completed[0].update.$set.status, 'in_progress');
  assert.equal(completed[0].update.$set.taskRole, 'supervisor');
  } finally {
    FollowUp.findById = original.taskFind; FollowUp.findOneAndUpdate = original.taskUpsert;
    FollowUp.updateOne = original.taskUpdate; Order.findById = original.orderFind;
    Order.findOneAndUpdate = original.orderUpdate; User.findById = original.userFind;
  }
});

test('advisor must attach an existing report and a linked specialist before booking is assigned', async () => {
  const original = {
    taskFind: FollowUp.findById, taskUpsert: FollowUp.findOneAndUpdate, taskUpdate: FollowUp.updateOne,
    orderFind: Order.findById, orderUpdate: Order.findOneAndUpdate, userFind: User.findById,
    reportFind: MedicalReport.find, expertFind: MedicalExpert.findOne, adminFind: Admin.findOne,
    referralUpsert: Referral.findOneAndUpdate,
  };
  const advisor = id(), planner = id(), manager = id(), specialist = id(), tenant = id();
  const patientId = id(), orderId = id(), taskId = id(), expertId = id(), reportId = id();
  const order = { _id: orderId, user: patientId, serviceName: '企业家健康决策计划', status: 'scheduled',
    tradeStatus: 'paid', paymentStatus: 'paid', refundStatus: 'none', supervisorId: planner, decisionReferral: { stage: 'advisor' } };
  const patient = { _id: patientId, tenantId: tenant, assignedFamilyDoctor: advisor,
    assignedHealthManager: manager, assignedHealthPlanner: planner };
  const task = { _id: taskId, sourceType: 'order', sourceOrderId: orderId, patientId, staffId: advisor,
    assignedTo: advisor, workflowKey: 'decision_referral:advisor', status: 'planned' };
  const reports = [{ _id: reportId, title: '本次体检报告', fileUrl: 'https://example.invalid/report.pdf' }];
  const expert = { _id: expertId, linkedStaffId: specialist, name: '测试专家', title: '主任医师',
    institutionId: { name: '测试医院' }, departmentId: { name: '内科', campus: '主院区' } };
  let savedReferral;
  const createdTasks = [];
  try {
    FollowUp.findById = async () => task;
    FollowUp.findOneAndUpdate = async (_filter, update) => { createdTasks.push(update.$setOnInsert); return update.$setOnInsert; };
    FollowUp.updateOne = async () => ({ modifiedCount: 1 });
    Order.findById = async () => order;
    Order.findOneAndUpdate = async (_filter, update) => ({ ...order, ...update.$set });
    User.findById = () => ({ select: () => ({ lean: async () => patient }) });
    MedicalReport.find = () => ({ select: () => ({ lean: async () => reports }) });
    MedicalExpert.findOne = () => ({ populate() { return this; }, lean: async () => expert });
    Admin.findOne = () => ({ select: () => ({ lean: async () => ({ tenantId: tenant }) }) });
    Referral.findOneAndUpdate = async (_filter, update) => {
      savedReferral = update.$setOnInsert;
      return { ...savedReferral, medicalExpertId: expertId };
    };
    const req = { params: { id: String(taskId) }, staff: { _id: advisor, role: 'familyDoctor', tenantId: tenant },
      body: { medicalExpertId: String(expertId), expectedAt: '2026-10-18T10:00', method: 'remote',
        reason: '解析近期体检报告', questionList: '请解释主要异常项', reportIds: [String(reportId)] } };
    const res = response();
    await advance(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.decisionReferral.stage, 'booking');
    assert.equal(savedReferral.sourceReports.length, 1);
    assert.equal(String(savedReferral.sourceReports[0].reportId), String(reportId));
    assert.equal(String(savedReferral.toStaffId), String(specialist));
    assert.equal(String(createdTasks.find(row => row.workflowKey === 'decision_referral:booking').assignedTo), String(manager));
    assert.equal(String(createdTasks.find(row => row.workflowKey === 'decision_referral:specialist').assignedTo), String(specialist));
    assert.equal(createdTasks.find(row => row.workflowKey === 'decision_referral:specialist').isBlocked, true);
  } finally {
    FollowUp.findById = original.taskFind; FollowUp.findOneAndUpdate = original.taskUpsert;
    FollowUp.updateOne = original.taskUpdate; Order.findById = original.orderFind;
    Order.findOneAndUpdate = original.orderUpdate; User.findById = original.userFind;
    MedicalReport.find = original.reportFind; MedicalExpert.findOne = original.expertFind;
    Admin.findOne = original.adminFind; Referral.findOneAndUpdate = original.referralUpsert;
  }
});

test('specialist reply unlocks advisor review only after manager booking', async () => {
  const original = { orderFind: Order.findById, orderUpdate: Order.updateOne,
    referralFind: Referral.findById, userFind: User.findById, taskUpsert: FollowUp.findOneAndUpdate,
    taskUpdate: FollowUp.updateOne };
  const orderId = id(), patientId = id(), referralId = id(), advisor = id();
  const order = { _id: orderId, user: patientId, serviceName: '企业家健康决策计划',
    status: 'scheduled', tradeStatus: 'paid', paymentStatus: 'paid', refundStatus: 'none',
    decisionReferral: { stage: 'specialist', referralId } };
  const created = [], updates = [];
  try {
    Order.findById = async () => order;
    Order.updateOne = async (_filter, update) => { updates.push(update.$set); return { modifiedCount: 1 }; };
    Referral.findById = () => ({ lean: async () => ({ _id: referralId, status: 'completed' }) });
    User.findById = () => ({ select: () => ({ lean: async () => ({ _id: patientId, assignedFamilyDoctor: advisor }) }) });
    FollowUp.findOneAndUpdate = async (_filter, update) => { created.push(update.$setOnInsert); return update.$setOnInsert; };
    FollowUp.updateOne = async () => ({ modifiedCount: 1 });
    await workflow.onReferralFeedback({ _id: referralId, sourceOrderId: orderId, status: 'completed' });
    assert.equal(created.length, 0);
    assert.equal(updates.length, 0);
    order.decisionReferral.booking = { confirmedAt: new Date() };
    await workflow.onReferralFeedback({ _id: referralId, sourceOrderId: orderId, status: 'completed' });
    assert.equal(created.length, 1);
    assert.equal(created[0].workflowKey, 'decision_referral:advisor_review');
    assert.equal(String(created[0].assignedTo), String(advisor));
    assert.equal(updates[0]['decisionReferral.stage'], 'advisor_review');
  } finally {
    Order.findById = original.orderFind; Order.updateOne = original.orderUpdate;
    Referral.findById = original.referralFind; User.findById = original.userFind;
    FollowUp.findOneAndUpdate = original.taskUpsert; FollowUp.updateOne = original.taskUpdate;
  }
});

test('planner cannot close an archived service after specialist feedback changes', async () => {
  const original = {
    taskFind: FollowUp.findById, taskUpdate: FollowUp.updateOne, taskUpdateMany: FollowUp.updateMany,
    orderFind: Order.findById, orderUpdate: Order.findOneAndUpdate, userFind: User.findById,
    referralFind: Referral.findById, fulfillmentUpdate: Fulfillment.updateOne,
    settle: commission.settleOrderCommission,
  };
  const planner = id(), advisor = id(), tenant = id(), patientId = id(), orderId = id(), taskId = id(), referralId = id();
  const order = { _id: orderId, user: patientId, serviceName: '企业家健康决策计划', status: 'scheduled',
    tradeStatus: 'paid', paymentStatus: 'paid', refundStatus: 'none', totalUnits: 1, usedUnits: 0, supervisorId: planner,
    decisionReferral: { stage: 'planner_final', referralId,
      booking: { confirmedAt: new Date(), actualAt: new Date() },
      archive: { reviewedAt: new Date(), referralFeedbackVersion: 1 } } };
  const task = { _id: taskId, sourceType: 'order', sourceOrderId: orderId, patientId, staffId: planner,
    assignedTo: planner, workflowKey: 'decision_referral:planner_final', status: 'planned' };
  let feedbackVersion = 2, orderWrites = 0, settlement = 0;
  try {
    FollowUp.findById = async () => task;
    FollowUp.updateOne = async () => ({ modifiedCount: 1 });
    FollowUp.updateMany = async () => ({ modifiedCount: 0 });
    Order.findById = async () => order;
    Order.findOneAndUpdate = async (_filter, update) => { orderWrites++; return { ...order, ...update.$set }; };
    User.findById = () => ({ select: () => ({ lean: async () => ({ _id: patientId, tenantId: tenant, assignedHealthPlanner: planner }) }) });
    Referral.findById = () => ({ select: () => ({ lean: async () => ({ status: 'completed', feedbackVersion }) }) });
    Fulfillment.updateOne = async () => ({ modifiedCount: 1 });
    commission.settleOrderCommission = async () => { settlement++; return { created: [] }; };
    const req = { params: { id: String(taskId) }, staff: { _id: planner, role: 'healthPlanner', tenantId: tenant },
      body: { acceptanceNote: '预约、专科解析和顾问归档均已核实' } };
    const stale = response();
    await advance(req, stale);
    assert.equal(stale.statusCode, 409);
    assert.equal(orderWrites, 0);
    feedbackVersion = 1;
    const approved = response();
    await advance(req, approved);
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.body.data.status, 'completed');
    assert.equal(approved.body.data.decisionReferral.stage, 'completed');
    assert.equal(settlement, 1);
  } finally {
    FollowUp.findById = original.taskFind; FollowUp.updateOne = original.taskUpdate;
    FollowUp.updateMany = original.taskUpdateMany; Order.findById = original.orderFind;
    Order.findOneAndUpdate = original.orderUpdate; User.findById = original.userFind;
    Referral.findById = original.referralFind; Fulfillment.updateOne = original.fulfillmentUpdate;
    commission.settleOrderCommission = original.settle;
  }
});

test('specialist cannot open a report omitted from the advisor referral', async () => {
  const original = Referral.findById;
  const referralId = id(), patientId = id(), orderId = id(), attachedId = id(), otherId = id(), specialist = id();
  try {
    Referral.findById = () => ({ select: () => ({ lean: async () => ({
      _id: referralId, patientId, sourceOrderId: orderId, toStaffId: specialist,
      sourceReports: [{ reportId: attachedId }],
    }) }) });
    const res = response();
    await reportAccess({ params: { id: String(referralId), reportId: String(otherId) },
      staff: { _id: specialist, role: 'specialist' } }, res);
    assert.equal(res.statusCode, 404);
    assert.match(res.body.message, /未授权/);
  } finally { Referral.findById = original; }
});
