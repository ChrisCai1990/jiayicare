// Synthetic paid state, real local redemption API. No payment gateway or funds.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const mongoose = require('mongoose');
async function main() {
  const manifest = process.argv[2], session = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User'), Order = require('../../src/models/Order');
  const FollowUp = require('../../src/models/FollowUp'), HealthPlan = require('../../src/models/HealthPlan');
  const Handoff = require('../../src/models/CheckupPreparationHandoff');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const dir = path.dirname(manifest);
  const service = JSON.parse(fs.readFileSync(path.join(dir, 'service-http.json'), 'utf8'));
  const closure = JSON.parse(fs.readFileSync(path.join(dir, 'closure-http.json'), 'utf8'));
  assert.equal(closure.awaitingRedemption.orderId, service.orderId);
  const call = async (route, token, method = 'GET', body) => {
    const response = await fetch(session.api + route, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    return { status: response.status, body: await response.json() };
  };
  const tokens = {};
  for (const a of session.accounts) {
    const login = await call('/staff/login', null, 'POST', { username: a.username, password: a.password });
    assert.equal(login.status, 200); tokens[a.role] = login.body.data.token;
  }
  const route = `/staff/orders/${service.orderId}/redeem`;
  const initial = await Order.findById(service.orderId).lean();
  const managerBefore = await FollowUp.findById(closure.awaitingRedemption.managerTaskId).lean();
  const awaitsOutcome = require('../../src/utils/followUpContinuity').requiresOutcomeReview(managerBefore)
    && managerBefore.status !== 'completed';
  assert.equal(String(initial.user), session.patientId);
  assert.equal(initial.serviceName, '隔离双次体检核销（纯模拟，未真实付款）');
  assert.equal(initial.totalUnits, 2);
  if (!initial.usedUnits) {
    const denied = await call(route, tokens.healthManager, 'POST', { note: '隔离越权验证' });
    assert.equal(denied.status, 403, JSON.stringify(denied));
    assert.equal((await Order.findById(service.orderId)).usedUnits, 0);
    const responses = await Promise.all([1, 2].map(() => call(route, tokens.healthPlanner, 'POST', { note: '隔离核销验收，无真实付款' })));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409], JSON.stringify(responses));
    console.log('Wrong role denied; concurrent planner redemption accepted exactly once');
  }
  const order = await Order.findById(service.orderId).lean();
  assert.equal(order.usedUnits, 1); assert.equal(order.status, 'scheduled'); assert.equal(order.redemptions.length, 1);
  assert.equal(String(order.redemptions[0].servicePlanId), service.serviceId);
  assert.equal(String(order.redemptions[0].handoffId), service.handoffId);
  assert.equal(String(order.redemptions[0].finalTaskId), service.taskIds.final_acceptance);
  const link = await Handoff.findById(service.handoffId).lean();
  const manager = await FollowUp.findById(closure.awaitingRedemption.managerTaskId).lean();
  if (process.argv.includes('--merged-outcome')) {
    assert.equal(link.completion.status, 'completed', JSON.stringify(link.completion));
    assert.equal(manager.status, 'completed');
    assert.equal(String(manager.outcomeReview.sourceServiceReviewId), service.taskIds.result_review);
    assert.equal(manager.outcomeReview.decision, process.argv.includes('--new-plan') ? 'new_plan' : 'no_further');
    assert.equal(manager.outcomeReview.nextFollowUpIds.length, process.argv.includes('--new-plan') ? 1 : 0);
  } else if (awaitsOutcome) {
    assert.notEqual(link.completion.status, 'completed');
    assert.equal(manager.status, managerBefore.status);
    assert.equal(manager.outcomeReview, null);
  } else {
    assert.equal(link.completion.status, 'completed'); assert.equal(manager.status, 'completed');
  }
  assert.equal((await HealthPlan.findById(service.serviceId)).status, 'completed');
  const duplicate = await call(route, tokens.healthPlanner, 'POST', { note: '隔离重复请求' });
  assert.equal(duplicate.status, 409, JSON.stringify(duplicate));
  const after = await Order.findById(service.orderId).lean();
  assert.equal(after.usedUnits, 1); assert.equal(after.redemptions.length, 1);
  assert.equal(String((await FollowUp.findById(manager._id)).completedAt), String(manager.completedAt));
  assert.equal(await FollowUp.countDocuments({ patientId: session.patientId, sourceHealthPlanId: service.serviceId, status: { $nin: ['completed', 'cancelled'] } }), 0);
  // A real patient-list read reconciles missing order intake; it must not
  // recreate an appointment after this service has already been accepted.
  const listing = await call(`/staff/patients/${session.patientId}/followups`, tokens.healthPlanner);
  assert.equal(listing.status, 200, JSON.stringify(listing));
  assert.equal(await FollowUp.countDocuments({ patientId: session.patientId, sourceType: 'order', sourceOrderId: service.orderId, status: { $nin: ['completed', 'cancelled'] } }), 0);
  for (const role of ['familyDoctor', 'healthPlanner', 'healthManager', 'medicalAssistant']) {
    const workbench = await call('/staff/service-tasks', tokens[role]);
    assert.equal(workbench.status, 200);
    assert.equal(JSON.stringify(workbench.body.data).includes(service.serviceId), false, `${role}: completed exact service must not remain pending`);
  }
  console.log(process.argv.includes('--merged-outcome') ? 'PASS one advisor decision: original closed automatically after exact redemption, no separate outcome call' : awaitsOutcome ? 'Service redeemed; original management plan stays open pending advisor outcome' : 'Historical closed plan preserved; redemption replay rejected (not new-policy closure evidence)');
  fs.writeFileSync(path.join(dir, 'redemption-http.json'), JSON.stringify({ patientId: session.patientId, serviceId: service.serviceId, orderId: service.orderId, managerTaskId: String(manager._id), completedAt: manager.completedAt, usedUnits: after.usedUnits, totalUnits: after.totalUnits, duplicateStatus: duplicate.status, syntheticPaymentOnly: true }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
