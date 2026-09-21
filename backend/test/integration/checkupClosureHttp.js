// Local synthetic report/results; real HTTP audit/completion, not AI or medical acceptance.
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
  const User = require('../../src/models/User');
  const FollowUp = require('../../src/models/FollowUp');
  const MedicalReport = require('../../src/models/MedicalReport');
  const HealthPlan = require('../../src/models/HealthPlan');
  const Handoff = require('../../src/models/CheckupPreparationHandoff');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const dir = path.dirname(sessionPath);
  const service = JSON.parse(fs.readFileSync(path.join(dir, 'service-http.json'), 'utf8'));
  const prep = JSON.parse(fs.readFileSync(path.join(dir, 'preparation-http.json'), 'utf8'));
  const resultPath = path.join(dir, 'closure-http.json');
  const evidence = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : { checks: [] };
  const save = () => fs.writeFileSync(resultPath, JSON.stringify(evidence, null, 2));
  const check = label => { if (!evidence.checks.includes(label)) evidence.checks.push(label); save(); console.log(label); };
  const request = async (route, token, method = 'GET', body, expected = 200) => {
    const res = await fetch(session.api + route, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const json = await res.json();
    assert.equal(res.status, expected, `${method} ${route}: ${JSON.stringify(json)}`);
    return json;
  };
  const tokens = {};
  for (const a of session.accounts) tokens[a.role] = (await request('/staff/login', null, 'POST', { username: a.username, password: a.password })).data.token;
  if (!evidence.reportId) {
    const report = await MedicalReport.create({ user: session.patientId, title: '隔离模拟报告（非真实医疗资料）', sourceHealthPlanId: service.serviceId, aiStatus: 'pending' });
    evidence.reportId = String(report._id); save();
  }
  const collection = await FollowUp.findById(service.taskIds.report_collection);
  if (process.argv.includes('--prepare-report-only')) {
    assert.equal((await FollowUp.findById(service.taskIds.onsite)).status, 'completed');
    assert.equal(collection.isBlocked, false);
    assert.notEqual(collection.status, 'completed');
    assert.equal((await FollowUp.findById(service.taskIds.result_review)).isBlocked, true);
    check('Browser onsite completion unlocked original collection, review still blocked; synthetic report seeded only');
    return;
  }
  if (collection.status !== 'completed') {
    await request(`/staff/followups/${collection._id}`, tokens.healthManager, 'PUT', { status: 'completed', content: '隔离模拟报告回收', serviceChecklist: [{ serviceReviewed: true, collectionStatus: 'complete', reportIds: [evidence.reportId], itemChecks: [{ name: '隔离模拟项目', status: 'completed' }] }] });
  }
  const report = await MedicalReport.findById(evidence.reportId);
  if (report.audit_status !== 'audited') {
    assert.equal((await FollowUp.findById(service.taskIds.result_review)).isBlocked, true);
    check('Unaudited synthetic report did not unlock advisor result review');
    await request(`/staff/medical-reports/${report._id}/audit`, tokens.healthManager, 'PATCH', { action: 'approve' });
  }
  assert.equal((await FollowUp.findById(service.taskIds.result_review)).isBlocked, false);
  check('Real report audit route unlocked original advisor task');
  for (const [stage, role] of [['result_review', 'familyDoctor'], ['final_acceptance', 'healthPlanner']]) {
    await request(`/staff/followups/${service.taskIds[stage]}`, tokens[role], 'PUT', { status: 'completed', content: ' ', executedContent: 'stale value must not bypass empty content' }, 400);
    if ((await FollowUp.findById(service.taskIds[stage])).status !== 'completed') {
      await request(`/staff/followups/${service.taskIds[stage]}`, tokens[role], 'PUT', { status: 'completed', content: `隔离模拟${stage}结论；非真实评估或履约` });
    }
    assert.ok((await FollowUp.findById(service.taskIds[stage])).executedContent);
    check(`Actual ${stage} route saved conclusion and completed task`);
  }
  if (process.argv.includes('--await-redemption')) {
    assert.ok(service.orderId);
    const order = await require('../../src/models/Order').findById(service.orderId).lean();
    assert.equal(order.totalUnits, 2); assert.equal(order.usedUnits, 0);
    const pendingLink = await Handoff.findById(service.handoffId).lean();
    assert.notEqual(pendingLink.completion?.status, 'completed');
    const managers = await FollowUp.find({ patientId: session.patientId, sourceAnnualPlanId: prep.annualId,
      sourceType: 'scheduled', sourceScheduleKey: `annual_checkup:${prep.targetDate}` }).lean();
    assert.equal(managers.length, 1); assert.notEqual(managers[0].status, 'completed');
    evidence.awaitingRedemption = { orderId: service.orderId, managerTaskId: String(managers[0]._id) }; save();
    check('Final acceptance does not bypass the multi-unit redemption gate or complete manager followup');
    return;
  }
  assert.equal((await HealthPlan.findById(service.serviceId)).status, 'completed');
  const link = await Handoff.findById(service.handoffId).lean();
  evidence.completion = link.completion; save();
  const manager = await FollowUp.find({ patientId: session.patientId, sourceAnnualPlanId: prep.annualId, sourceType: 'scheduled', sourceScheduleKey: `annual_checkup:${prep.targetDate}` }).lean();
  assert.equal(manager.length, 1);
  assert.equal(manager[0].status, 'completed');
  assert.equal(link.completion.status, 'completed');
  check('Service closure completed the single original annual manager followup');
  const outstanding = await FollowUp.find({ patientId: session.patientId, sourceHealthPlanId: service.serviceId,
    sourceType: 'health_plan', status: { $nin: ['completed', 'cancelled'] } }).select('_id workflowKey status').lean();
  assert.deepEqual(outstanding, [], 'Completed service must not leave an intake or conditional task pending');
  check('Completed service has no outstanding source-linked staff tasks');
  const beforeCount = await FollowUp.countDocuments({ patientId: session.patientId });
  const finalTask = await FollowUp.findById(service.taskIds.final_acceptance).lean();
  await request(`/staff/followups/${finalTask._id}`, tokens.healthPlanner, 'PUT', { status: 'completed', content: finalTask.executedContent });
  assert.equal(await FollowUp.countDocuments({ patientId: session.patientId }), beforeCount);
  const afterManager = await FollowUp.findById(manager[0]._id).lean();
  assert.equal(String(afterManager.completedAt), String(manager[0].completedAt));
  assert.equal(String(afterManager.updatedAt), String(manager[0].updatedAt));
  check('Final acceptance replay did not create tasks or rewrite original manager completion');
  for (const role of ['familyDoctor', 'healthPlanner', 'healthManager', 'medicalAssistant']) {
    const workbench = await request('/staff/service-tasks', tokens[role]);
    assert.deepEqual(workbench.data, [], `Synthetic ${role} service workbench must have no remaining task`);
  }
  check('Four real role service workbench APIs contain no remaining service tasks');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
