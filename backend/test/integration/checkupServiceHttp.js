// Synthetic service configuration + actual service helper and HTTP handoff.
// Does not validate payment, external booking, AI or professional conclusions.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

async function main() {
  const sessionPath = process.argv[2];
  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  mongoose.set('autoIndex', false); mongoose.set('autoCreate', false);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { serverSelectionTimeoutMS: 3000 });
  const Admin = require('../../src/models/Admin');
  const User = require('../../src/models/User');
  const HealthPlan = require('../../src/models/HealthPlan');
  const FollowUp = require('../../src/models/FollowUp');
  const FollowUpPlan = require('../../src/models/FollowUpPlan');
  const Product = require('../../src/models/Product');
  const Handoff = require('../../src/models/CheckupPreparationHandoff');
  const prep = JSON.parse(fs.readFileSync(path.join(path.dirname(sessionPath), 'preparation-http.json'), 'utf8'));
  assert.equal(prep.readiness.readyForServiceLink, true);
  const resultFile = path.join(path.dirname(sessionPath), 'service-http.json');
  const report = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : { checks: [] };
  const standardTemplate = process.argv.includes('--standard-template');
  const withQuestionnaire = process.argv.includes('--with-questionnaire');
  assert.ok(!withQuestionnaire || standardTemplate, 'Questionnaire scenario requires standard template');
  if (report.productId) assert.equal(Boolean(report.standardTemplate), standardTemplate, 'Use a fresh scenario when switching templates');
  const save = () => fs.writeFileSync(resultFile, JSON.stringify(report, null, 2));
  const check = label => { if (!report.checks.includes(label)) report.checks.push(label); save(); console.log(label); };
  const request = async (route, token, method = 'GET', body, status = 200) => {
    const response = await fetch(session.api + route, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const json = await response.json();
    assert.equal(response.status, status, `${method} ${route}: ${JSON.stringify(json)}`);
    return json;
  };
  const tokens = {};
  for (const a of session.accounts) tokens[a.role] = (await request('/staff/login', null, 'POST', { username: a.username, password: a.password })).data.token;
  const patient = await User.findById(session.patientId);
  assert.equal(patient.name, '隔离验收客户（纯虚构）');
  patient.assignedMedicalAssistant = session.accounts.find(a => a.role === 'medicalAssistant').id;
  await patient.save();
  if (!report.productId) {
    const specs = [['plan_design', 'familyDoctor'], ['booking', 'healthPlanner'], ['onsite', 'medicalAssistant'],
      ['report_collection', 'healthManager'], ['result_review', 'familyDoctor'], ['final_acceptance', 'healthPlanner']];
    const schemes = [];
    if (standardTemplate) {
      // Import data only; never execute migration or load a credential-bearing .env.
      require('dotenv').config = () => ({ parsed: {} });
      const { TASK_PLAN_DRAFTS } = require('../../src/scripts/seedCheckupOneStopWorkflowDraft');
      for (const draft of TASK_PLAN_DRAFTS) schemes.push(await FollowUpPlan.create({ ...draft, reviewStatus: 'approved' }));
    } else for (const [stage, role] of specs) schemes.push(await FollowUpPlan.create({ name: `隔离体检-${stage}`, category: 'checkup',
      workflowStageKey: stage, executorRole: role, workflowTaskRole: stage === 'final_acceptance' ? 'supervisor' : 'executor',
      closesService: stage === 'final_acceptance', activationEvent: stage === 'result_review' ? 'report_audited' : '',
      completionStandard: '隔离验收模拟结果，非真实医疗服务', requiresCoordination: false }));
    let questionnaireId;
    if (withQuestionnaire) {
      const { DynamicQuestionnaire } = require('../../src/models/DynamicQuestionnaire');
      questionnaireId = (await DynamicQuestionnaire.create({ title: '隔离模拟健康文件', status: 'active', questions: [{ id: 'goal', type: 'text', text: '模拟需求', required: true }] }))._id;
      report.questionnaireId = String(questionnaireId);
    }
    const product = await Product.create({ name: '隔离体检流程（非销售商品）', originalPrice: 0, category: 'isolated_acceptance', status: 'on',
      serviceWorkflow: { key: 'checkup', questionnaireId, modules: schemes.map((s, i) => ({ planId: s._id, mode: s.workflowStageKey === 'abnormal_followup' ? 'conditional' : 'fixed', trigger: s.workflowStageKey === 'abnormal_followup' ? 'abnormal_found' : '', sequence: i })) } });
    report.productId = String(product._id); report.standardTemplate = standardTemplate; save();
  }
  if (!report.serviceId) {
    const advisor = await Admin.findById(patient.assignedFamilyDoctor);
    const result = await require('../../src/utils/checkupServiceInstance').ensureStaffInitiatedCheckupService({
      patient, staff: advisor, productId: report.productId, desiredServiceDate: prep.targetDate,
      serviceRequirements: '仅隔离流程验收，不联系真实客户/机构，不创建支付订单' });
    report.serviceId = String(result.servicePlan._id); save();
    check('Actual staff-initiation helper created a synthetic no-order service from fixture workflow configuration');
  }
  let service = await HealthPlan.findById(report.serviceId).lean();
  // Isolated test input only: no payment API, gateway, real sale or notification.
  // Attach before publishing/activating any stage, never retrofit a closed service.
  if (process.argv.includes('--synthetic-paid-order') && !report.orderId) {
    assert.ok(!service.pushedAt, 'Paid fixture requires a fresh service');
    const order = await require('../../src/models/Order').create({ user: patient._id, serviceId: report.productId,
      serviceName: '隔离双次体检核销（纯模拟，未真实付款）', orderType: 'service', status: 'scheduled',
      paymentStatus: 'paid', tradeStatus: 'paid', servicePrice: 2, unitPrice: 1, totalUnits: 2,
      note: 'SYNTHETIC PAYMENT STATE ONLY. No gateway or funds.' });
    await HealthPlan.updateOne({ _id: service._id, pushedAt: null }, { $set: { sourceOrderId: order._id } });
    report.orderId = String(order._id); save();
    service = await HealthPlan.findById(report.serviceId).lean();
    assert.equal(String(service.sourceOrderId), report.orderId);
  }
  if (report.orderId && !service.pushedAt) {
    // Normal paid orders already have intake history before publishing. Use the
    // existing patient-scoped reconciler, not a fabricated completed task.
    await require('../../src/utils/orderWorkItem').reconcileInactiveOrderWorkItems(patient._id);
    assert.equal(await FollowUp.countDocuments({ sourceType: 'order', sourceOrderId: report.orderId }), 1);
  }
  if (withQuestionnaire && service.content?.checkupIntake?.status !== 'submitted') {
    assert.ok(report.questionnaireId, 'Use a fresh scenario with a bound questionnaire');
    const PushRecord = require('../../src/models/PushRecord');
    const assignment = await PushRecord.findOne({ sourceHealthPlanId: service._id, type: 'questionnaire', questionnaireId: report.questionnaireId }).lean();
    assert.ok(assignment, 'Original service helper must create the assignment');
    const before = await FollowUp.countDocuments({ sourceHealthPlanId: service._id });
    await request(`/staff/plans/${service._id}/push`, tokens.familyDoctor, 'PATCH', {}, 409);
    assert.equal(await FollowUp.countDocuments({ sourceHealthPlanId: service._id }), before);
    check('Unsubmitted customer questionnaire blocks publishing without creating employee tasks');
    const code = require('node:crypto').randomBytes(12).toString('hex');
    await mongoose.connection.db.collection('verificationcodes').updateOne({ phone: patient.phone }, { $set: { phone: patient.phone, code, expiresAt: new Date(Date.now() + 60000) } }, { upsert: true });
    const client = (await request('/auth/login', null, 'POST', { phone: patient.phone, code })).data.token;
    await request(`/questionnaire/${report.questionnaireId}/submit`, client, 'POST', { assignmentId: String(assignment._id), answers: { goal: '纯虚构隔离验收需求，不代表医疗建议' } });
    service = await HealthPlan.findById(report.serviceId).lean();
    assert.equal(service.content.checkupIntake.status, 'submitted');
    check('Actual customer questionnaire submission saved service-scoped intake evidence');
  }
  if (!service.pushedAt) await request(`/staff/plans/${report.serviceId}/push`, tokens.familyDoctor, 'PATCH', {});
  service = await HealthPlan.findById(report.serviceId).lean();
  check('Actual publish route created service-stage tasks');
  await Handoff.collection.createIndex({ servicePlanId: 1 }, { unique: true });
  const root = `/staff/followups/${prep.plannerTaskId}/checkup-preparation`;
  const before = await FollowUp.countDocuments({ sourceHealthPlanId: service._id });
  const linked = await request(root + '/service-link', tokens.healthPlanner, 'POST', { servicePlanId: report.serviceId, updatedAt: service.updatedAt });
  report.handoffId = String(linked.data._id); save();
  await request(root + '/service-link', tokens.healthPlanner, 'POST', { servicePlanId: report.serviceId, updatedAt: service.updatedAt });
  assert.equal(await Handoff.countDocuments({ servicePlanId: service._id }), 1);
  check('Exact service linked through real route; replay retained one handoff');
  const originalRows = await FollowUp.find({ sourceHealthPlanId: service._id }).populate('followUpSchemeId').lean();
  if (withQuestionnaire) {
    assert.equal(originalRows.filter(r => r.followUpSchemeId?.executorRole === 'customer').length, 0);
    check('Standard customer stage created no employee fallback task');
  }
  report.taskIds = Object.fromEntries(originalRows.filter(r => r.followUpSchemeId).map(r => [r.followUpSchemeId.workflowStageKey, String(r._id)]));
  report.taskSnapshot = originalRows.map(r => ({ id: String(r._id), stage: r.followUpSchemeId?.workflowStageKey || r.workflowKey,
    configuredRole: r.followUpSchemeId?.executorRole, assignedTo: String(r.assignedTo || ''), status: r.status, parent: String(r.dependsOnTaskId || '') }));
  save();
  let activated;
  try {
    activated = await request(root + '/activate', tokens.healthPlanner, 'POST', {});
    delete report.activationFailure;
  } catch (error) {
    report.activationFailure = { at: new Date().toISOString(), message: error.message };
    save();
    throw error;
  }
  assert.equal(activated.data.status, 'active');
  await request(root + '/activate', tokens.healthPlanner, 'POST', {});
  assert.equal(await FollowUp.countDocuments({ sourceHealthPlanId: service._id }), before);
  const rows = await FollowUp.find({ sourceHealthPlanId: service._id }).populate('followUpSchemeId').lean();
  const design = rows.find(r => r.followUpSchemeId?.workflowStageKey === 'plan_design');
  const booking = rows.find(r => r.followUpSchemeId?.workflowStageKey === 'booking');
  assert.equal(design.status, 'completed'); assert.ok(['in_progress', 'completed'].includes(booking.status)); assert.equal(booking.isBlocked, false);
  report.taskIds = Object.fromEntries(rows.filter(r => r.followUpSchemeId).map(r => [r.followUpSchemeId.workflowStageKey, String(r._id)])); save();
  check('Existing design completed and booking activated exactly once; no duplicate tasks');
  if (process.argv.includes('--prepare-only')) {
    console.log('Stopped at booking for manual isolated UI acceptance; no execution results submitted.');
    return;
  }
  async function complete(stage, role, extra = {}) {
    const task = await FollowUp.findById(report.taskIds[stage]).lean();
    if (task.status === 'completed') return;
    await request(`/staff/followups/${task._id}`, tokens[role], 'PUT', { status: 'completed', content: `隔离模拟-${stage}执行结论，非真实服务`, ...extra });
  }
  const bookingPayload = { serviceChecklist: [{ key: 'isolated_booking', executionStatus: 'completed', executionResult: '隔离模拟预约',
    appointmentDetails: { appointmentDate: prep.targetDate, appointmentTime: '09:00' } }] };
  await complete('booking', 'healthPlanner', bookingPayload);
  assert.equal((await FollowUp.findById(report.taskIds.onsite).lean()).isBlocked, false);
  await complete('onsite', 'medicalAssistant');
  assert.equal((await FollowUp.findById(report.taskIds.report_collection).lean()).isBlocked, false);
  check('Actual completion routes advanced booking to onsite and onsite to report collection');
  await request(`/staff/followups/${report.taskIds.booking}`, tokens.healthPlanner, 'PUT', { status: 'completed', content: '隔离模拟预约重复保存', ...bookingPayload });
  assert.equal((await FollowUp.findById(report.taskIds.onsite).lean()).status, 'completed', 'Replaying booking must not reopen completed onsite work');
  check('Replaying prior booking preserved completed downstream work');
  console.log('Report return, final acceptance and manager closure remain unverified; booking/onsite used synthetic results, not real external services.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
