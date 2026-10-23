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
const saveMembers = workflow.router.stack.find(layer => layer.route?.path === '/referrals/:id/members').route.stack.at(-1).handle;
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
    Admin.findOne = () => ({ select: () => ({ lean: async () => ({ _id: specialist, name: '院方联系人', role: 'specialist', tenantId: tenant }) }) });
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

    const secondExpertId = id(), coordinatorId = id();
    const savedReferrals = [];
    MedicalExpert.findOne = filter => ({ populate() { return this; }, lean: async () =>
      String(filter._id) === String(secondExpertId)
        ? { ...expert, _id: secondExpertId, name: '第二专家', linkedStaffId: null,
          departmentId: { name: '神经内科', campus: '东院区' } } : expert });
    Admin.findOne = () => ({ select: () => ({ lean: async () => ({ _id: coordinatorId,
      name: '会诊秘书', role: 'institutionStaff', tenantId: tenant }) }) });
    Referral.findOneAndUpdate = async (_filter, update) => {
      savedReferrals.push(update.$setOnInsert);
      return { ...update.$setOnInsert, medicalExpertId: update.$setOnInsert.medicalExpertId };
    };
    order.decisionReferral = { stage: 'advisor' };
    createdTasks.length = 0;
    const multi = response();
    await advance({ ...req, body: { ...req.body, reason: '', questionList: '', consultationType: 'multidisciplinary',
      coordinatorStaffId: String(coordinatorId), specialties: [
      { medicalExpertId: String(expertId), focusQuestion: '核对肺结节变化' },
      { medicalExpertId: String(secondExpertId), focusQuestion: '评估头痛原因' },
    ] } }, multi);
    assert.equal(multi.statusCode, 200);
    assert.equal(multi.body.data.decisionReferral.referralIds.length, 1);
    assert.equal(savedReferrals.length, 1);
    assert.equal(savedReferrals[0].consultationMembers.length, 2);
    assert.equal(savedReferrals[0].reason, '多学科会诊报告解析');
    assert.match(savedReferrals[0].questionList, /核对肺结节变化/);
    assert.match(savedReferrals[0].questionList, /评估头痛原因/);
    assert.equal(String(savedReferrals[0].toStaffId), String(coordinatorId));
    assert.equal(multi.body.data.decisionReferral.plan.specialties[1].campus, '');
    assert.equal(multi.body.data.decisionReferral.plan.specialties[1].expectedAt, null);
    assert.deepEqual(createdTasks.filter(row => row.workflowKey.startsWith('decision_referral:specialist'))
      .map(row => row.workflowKey), ['decision_referral:specialist']);

    order.decisionReferral = { stage: 'advisor' };
    savedReferrals.length = 0;
    const leadOnly = response();
    await advance({ ...req, body: { ...req.body, consultationType: 'multidisciplinary',
      coordinatorStaffId: String(coordinatorId), specialties: [
        { medicalExpertId: String(expertId), focusQuestion: '请核对异常指标' },
      ] } }, leadOnly);
    assert.equal(leadOnly.statusCode, 200);
    assert.equal(savedReferrals[0].consultationMembers.length, 1);
    order.decisionReferral = { stage: 'advisor' };
    const missingFocus = response();
    await advance({ ...req, body: { ...req.body, consultationType: 'multidisciplinary',
      coordinatorStaffId: String(coordinatorId), specialties: [{ medicalExpertId: String(expertId) }] } }, missingFocus);
    assert.equal(missingFocus.statusCode, 400);
    assert.match(missingFocus.body.message, /本专科重点问题/);
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

test('multidisciplinary consultation waits for every specialist reply', async () => {
  const original = { orderFind: Order.findById, orderUpdate: Order.updateOne,
    referralFind: Referral.findById, userFind: User.findById, taskUpsert: FollowUp.findOneAndUpdate,
    taskUpdate: FollowUp.updateOne };
  const orderId = id(), patientId = id(), firstId = id(), secondId = id(), advisor = id();
  const order = { _id: orderId, user: patientId, serviceName: '企业家健康决策计划',
    status: 'scheduled', tradeStatus: 'paid', paymentStatus: 'paid', refundStatus: 'none',
    decisionReferral: { stage: 'specialist', referralId: firstId, referralIds: [firstId, secondId],
      booking: { confirmedAt: new Date() } } };
  const statuses = new Map([[String(firstId), 'completed'], [String(secondId), 'pending']]);
  let reviews = 0, taskCompletions = 0;
  try {
    Order.findById = async () => order;
    Order.updateOne = async () => { reviews++; return { modifiedCount: 1 }; };
    Referral.findById = referralId => ({ lean: async () => ({ _id: referralId, status: statuses.get(String(referralId)) }) });
    User.findById = () => ({ select: () => ({ lean: async () => ({ _id: patientId, assignedFamilyDoctor: advisor }) }) });
    FollowUp.findOneAndUpdate = async () => ({});
    FollowUp.updateOne = async () => { taskCompletions++; return { modifiedCount: 1 }; };
    await workflow.onReferralFeedback({ _id: firstId, sourceOrderId: orderId, status: 'completed' });
    assert.equal(reviews, 0);
    statuses.set(String(secondId), 'completed');
    await workflow.onReferralFeedback({ _id: secondId, sourceOrderId: orderId, status: 'completed' });
    assert.equal(reviews, 1);
    assert.equal(taskCompletions, 2);
  } finally {
    Order.findById = original.orderFind; Order.updateOne = original.orderUpdate;
    Referral.findById = original.referralFind; User.findById = original.userFind;
    FollowUp.findOneAndUpdate = original.taskUpsert; FollowUp.updateOne = original.taskUpdate;
  }
});

test('one multidisciplinary referral books the lead department before hospital organizes other experts', async () => {
  const original = { taskFind: FollowUp.findById, taskUpdate: FollowUp.updateOne,
    orderFind: Order.findById, orderUpdate: Order.findOneAndUpdate,
    userFind: User.findById, referralFind: Referral.findById, referralUpdate: Referral.updateOne };
  const manager = id(), coordinator = id(), tenant = id(), patientId = id(), orderId = id();
  const taskKey = id(), referralId = id(), firstExpert = id(), secondExpert = id();
  const order = { _id: orderId, user: patientId, serviceName: '企业家健康决策计划', status: 'scheduled',
    tradeStatus: 'paid', paymentStatus: 'paid', refundStatus: 'none',
    decisionReferral: { stage: 'booking', referralId, referralIds: [referralId], plan: {
      consultationType: 'multidisciplinary', coordinatorStaffId: coordinator,
      specialties: [{ medicalExpertId: firstExpert }, { medicalExpertId: secondExpert }],
    } } };
  const task = { _id: taskKey, sourceType: 'order', sourceOrderId: orderId, patientId,
    assignedTo: manager, staffId: manager, workflowKey: 'decision_referral:booking', status: 'planned' };
  const taskUpdates = [];
  let bookingSnapshot;
  try {
    FollowUp.findById = async () => task;
    FollowUp.updateOne = async (filter, update) => { taskUpdates.push({ filter, update }); return { modifiedCount: 1 }; };
    Order.findById = async () => order;
    Order.findOneAndUpdate = async (_filter, update) => ({ ...order, ...update.$set });
    User.findById = () => ({ select: () => ({ lean: async () => ({ _id: patientId,
      tenantId: tenant, assignedHealthManager: manager }) }) });
    Referral.findById = () => ({ lean: async () => ({ status: 'pending' }),
      select: () => ({ lean: async () => ({ status: 'pending' }) }) });
    Referral.updateOne = async (_filter, update) => { bookingSnapshot = update.$set.bookingSnapshot; return { modifiedCount: 1 }; };
    const res = response();
    await advance({ params: { id: String(taskKey) }, staff: { _id: manager, role: 'healthManager', tenantId: tenant },
      body: { contactNote: '已告知客户由牵头科室协调会诊时间', bookings: [
        { appointmentNote: '牵头科室已接入，待统一确认院区和时间' },
      ] } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.decisionReferral.booking.slots.length, 1);
    assert.equal(res.body.data.decisionReferral.booking.slots[0].actualAt, null);
    assert.equal(String(res.body.data.decisionReferral.booking.slots[0].referralId), String(referralId));
    assert.equal(bookingSnapshot.slots.length, 1);
    assert.equal(taskUpdates.filter(row => row.update.$set.isBlocked === false).length, 1);
  } finally {
    FollowUp.findById = original.taskFind; FollowUp.updateOne = original.taskUpdate;
    Order.findById = original.orderFind; Order.findOneAndUpdate = original.orderUpdate;
    User.findById = original.userFind; Referral.findById = original.referralFind;
    Referral.updateOne = original.referralUpdate;
  }
});

test('hospital coordinator adds consultation members to the same referral', async () => {
  const original = { referralFind: Referral.findById, orderFind: Order.findById };
  const coordinator = id(), orderId = id(), referralId = id();
  const referral = { _id: referralId, sourceOrderId: orderId, toStaffId: coordinator,
    consultationType: 'multidisciplinary', status: 'accepted',
    consultationMembers: [{ hospital: '牵头医院', campus: '本部', department: '神经内科', expert: '牵头专家' }],
    async save() { return this; } };
  const order = { _id: orderId, serviceName: '企业家健康决策计划', status: 'scheduled',
    tradeStatus: 'paid', paymentStatus: 'paid', refundStatus: 'none',
    decisionReferral: { stage: 'specialist', referralId, booking: { confirmedAt: new Date() } } };
  try {
    Referral.findById = async () => referral;
    Order.findById = () => ({ select: async () => order });
    const res = response();
    await saveMembers({ params: { id: String(referralId) }, staff: { _id: coordinator }, body: {
      consultationAt: '2026-10-20T14:00', method: 'outpatient', leadCampus: '本部', members: [{
      hospital: '会诊医院', department: '心内科', expert: '会诊专家',
    }] } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(referral.consultationMembers.length, 2);
    assert.equal(referral.consultationMembers[0].expert, '牵头专家');
    assert.equal(referral.consultationMembers[1].expert, '会诊专家');
    assert.equal(referral.consultationMembers[0].actualAt.getTime(), referral.consultationMembers[1].actualAt.getTime());
    assert.equal(referral.consultationSchedule.leadCampus, '本部');
  } finally { Referral.findById = original.referralFind; Order.findById = original.orderFind; }
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
