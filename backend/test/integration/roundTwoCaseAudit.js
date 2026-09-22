// Same-case acceptance snapshot. Credentials are read locally, never included in evidence.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), dir = path.dirname(process.argv[2]);
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User'), Plan = require('../../src/models/HealthPlan'), FollowUp = require('../../src/models/FollowUp');
  const Report = require('../../src/models/MedicalReport'), Handoff = require('../../src/models/CheckupPreparationHandoff');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const prep = JSON.parse(fs.readFileSync(path.join(dir, 'preparation-http.json')));
  const service = JSON.parse(fs.readFileSync(path.join(dir, 'service-http.json')));
  const closure = JSON.parse(fs.readFileSync(path.join(dir, 'closure-http.json')));
  const redemptionPath = path.join(dir, 'redemption-http.json');
  const redemption = fs.existsSync(redemptionPath) ? JSON.parse(fs.readFileSync(redemptionPath)) : null;
  if (redemption) assert.equal(redemption.patientId, session.patientId);
  const request = async (route, token, method = 'GET', body) => {
    const res = await fetch(session.api + route, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const json = await res.json(); assert.equal(res.status, 200, JSON.stringify(json)); return json.data;
  };
  const tokens = {};
  for (const a of session.accounts) tokens[a.role] = (await request('/staff/login', null, 'POST', { username: a.username, password: a.password })).token;
  const plan = await Plan.findById(prep.preparedPlanId);
  assert.equal(String(plan.patientId), session.patientId);
  const resultFile = path.join(dir, 'round-two-case.json');
  const previous = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile)) : {};
  const evidence = { patientId: session.patientId, annualId: prep.annualId, planId: prep.preparedPlanId, serviceId: service.serviceId,
    checkedAt: new Date(), supplementReportId: previous.supplementReportId, roles: {}, stages: [],
    boundaries: ['annual plan is preapproved fixture, not real AI', redemption ? 'synthetic paid state; real local redemption API, no real payment' : 'no paid order/redemption', 'UI actions recorded separately'] };
  if (process.argv.includes('--prepare-item-report') && !evidence.supplementReportId) {
    assert.equal(plan.items.length, 1); assert.equal(plan.items[0].status, 'pending'); assert.ok(!plan.items[0].reportId);
    const category = await require('../../src/models/ProjectCategory').create({ name: '隔离同案例补充分类（非正式配置）' });
    const created = await request('/staff/medical-reports', tokens.healthManager, 'POST', { patientId: session.patientId,
      title: '第二阶段同案例项目补充（纯模拟，无真实报告）', date: '2026-09-21', screeningL1: String(category._id),
      planId: prep.preparedPlanId, planItemId: String(plan.items[0]._id), sourceHealthPlanId: service.serviceId });
    evidence.supplementReportId = created._id;
    fs.writeFileSync(resultFile, JSON.stringify(evidence, null, 2));
  }
  for (const [stage, taskId] of Object.entries(service.taskIds)) {
    const task = await FollowUp.findById(taskId).lean(); assert.equal(task.status, 'completed');
    const ownerRole = { plan_design: 'familyDoctor', booking: 'healthPlanner', onsite: 'medicalAssistant',
      report_collection: 'healthManager', result_review: 'familyDoctor', final_acceptance: 'healthPlanner' }[stage];
    assert.equal(String(task.assignedTo), session.accounts.find(a => a.role === ownerRole).id);
    evidence.stages.push({ stage, taskId, status: task.status, assignedTo: String(task.assignedTo), completedAt: task.completedAt });
  }
  for (const taskId of [prep.advisorTaskId, prep.plannerTaskId]) assert.equal((await FollowUp.findById(taskId)).status, 'completed');
  const manager = await FollowUp.findById(closure.completion?.managerTaskId || redemption?.managerTaskId).lean();
  assert.equal(manager.status, 'completed'); assert.equal(String(manager.patientId), session.patientId);
  if (process.argv.includes('--reconcile-completion')) {
    // Run the existing daily consumer for this exact synthetic service only.
    // Do not repair statuses directly or treat this as automatic timer acceptance.
    await require('../../src/utils/checkupPreparationCompletion').runtime().forService(service.serviceId);
  }
  const handoff = await Handoff.findById(service.handoffId).lean();
  assert.equal(handoff.completion.status, 'completed');
  assert.equal(String(handoff.completion.managerTaskId), String(manager._id));
  assert.equal((await Plan.findById(service.serviceId)).status, 'completed');
  const serviceTasks = await FollowUp.find({ patientId: session.patientId, sourceHealthPlanId: service.serviceId, sourceType: 'health_plan' }).lean();
  assert.equal(serviceTasks.length, 7);
  assert.ok(serviceTasks.every(t => ['completed', 'cancelled'].includes(t.status)));
  evidence.serviceTaskCount = serviceTasks.length;
  assert.equal((await Report.findById(closure.reportId)).audit_status, 'audited');
  evidence.originalManagerTask = { id: manager._id, completedAt: manager.completedAt };
  if (previous.originalManagerTask) assert.equal(String(manager.completedAt.toISOString()), previous.originalManagerTask.completedAt);
  for (const role of ['familyDoctor','healthPlanner','healthManager','medicalAssistant']) {
    const tasks = await request('/staff/service-tasks', tokens[role]);
    const own = tasks.filter(t => String(t.patientId?._id || t.patientId) === session.patientId);
    assert.equal(own.length, 0, role + ' has unfinished same-case service tasks');
    const patientPlans = await request(`/staff/patients/${session.patientId}/plans`, tokens[role]);
    evidence.roles[role] = { serviceTasks: own.length, patientPlansAccessible: Boolean(patientPlans) };
    if (['familyDoctor','healthManager'].includes(role)) {
      const rows = await request('/staff/checkup-progress', tokens[role]);
      evidence.roles[role].pendingItems = rows.find(r => String(r.planId) === prep.preparedPlanId)?.pendingCount || 0;
    }
  }
  if (process.argv.includes('--verify-complete')) {
    assert.ok(evidence.supplementReportId);
    assert.equal((await Report.findById(evidence.supplementReportId)).audit_status, 'audited');
    assert.ok((await Plan.findById(plan._id)).items.every(item => item.status === 'completed'));
    assert.equal(evidence.roles.familyDoctor.pendingItems, 0); assert.equal(evidence.roles.healthManager.pendingItems, 0);
  }
  fs.writeFileSync(resultFile, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
