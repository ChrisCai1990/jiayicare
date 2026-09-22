// Actual local API, synthetic service/report inputs; no real AI or payment.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), m = require('mongoose');
async function main() {
  const manifest = process.argv[2], session = JSON.parse(fs.readFileSync(manifest));
  assert.equal(session.api, 'http://127.0.0.1:3000/api'); assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await m.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false });
  const User = require('../../src/models/User'), FollowUp = require('../../src/models/FollowUp'), Plan = require('../../src/models/HealthPlan'), Report = require('../../src/models/MedicalReport'), Link = require('../../src/models/FollowUpServiceLink');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const roles = Object.fromEntries(session.accounts.map(x => [x.role, x]));
  // Patient-scoped pilot servers must exercise the selected synthetic identity.
  const patient = session.rolloutMode === 'allowlist' ? await User.findById(session.patientId)
    : await User.create({ name: '隔离服务审核衔接（纯虚构）', assignedFamilyDoctor: roles.familyDoctor.id, assignedHealthManager: roles.healthManager.id, assignedHealthPlanner: roles.healthPlanner.id });
  const original = await FollowUp.create({ patientId: patient._id, assignedTo: roles.healthManager.id, staffId: roles.familyDoctor.id, theme: '原复查计划（模拟）', continuityRequired: true, status: 'in_progress' });
  const plan = await Plan.create({ patientId: patient._id, staffId: roles.familyDoctor.id, type: 'medical_assist', title: '门诊一站式（模拟）', status: 'active' });
  const report = { _id: new m.Types.ObjectId(), user: patient._id, sourceHealthPlanId: plan._id, title: '模拟门诊资料', documentCategory: 'outpatient_record', audit_status: 'audited', updatedAt: new Date(), createdAt: new Date() };
  await Report.collection.insertOne(report);
  const review = await FollowUp.create({ patientId: patient._id, assignedTo: roles.familyDoctor.id, staffId: roles.familyDoctor.id, sourceHealthPlanId: plan._id, sourceType: 'health_plan', taskRole: 'executor', workflowKey: 'system:outpatient_post_visit_review', theme: '门诊一站式：查看陪诊资料并制定随访计划', formData: { reportIds: [String(report._id)] } });
  await FollowUp.updateOne({ _id: review._id }, { $set: { status: 'planned' } });
  await Link.create({ patientId: patient._id, requestTaskId: new m.Types.ObjectId(), followUpId: original._id, targetType: 'health_plan', targetId: plan._id, linkedBy: roles.healthPlanner.id, title: '明确关联模拟服务' });
  let token;
  async function request(route, body, expected = 200, method = 'PUT') {
    const res = await fetch(session.api + route, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const data = await res.json(); assert.equal(res.status, expected, JSON.stringify(data)); return data.data;
  }
  token = (await request('/staff/login', { username: roles.familyDoctor.username, password: roles.familyDoctor.password }, 200, 'POST')).token;
  const body = { status: 'completed', content: '模拟资料审核', formData: { reportIds: [String(report._id)], checksComplete: false, reviewSummary: '模拟资料齐全', followUpContent: '模拟后续计划', followUpDate: '2026-10-10' } };
  await request(`/staff/followups/${review._id}`, body, 409);
  assert.equal((await FollowUp.findById(original._id)).status, 'in_progress');
  body.formData.checksComplete = true;
  await request(`/staff/followups/${review._id}`, body);
  const closed = await FollowUp.findById(original._id).lean();
  assert.equal(closed.status, 'completed'); assert.equal(String(closed.outcomeReview.sourceServiceReviewId), String(review._id));
  const next = await FollowUp.findById(closed.outcomeReview.nextFollowUpIds[0]).lean();
  assert.equal(String(next.assignedTo), roles.healthManager.id); assert.equal(next.status, 'planned');
  await request(`/staff/followups/${review._id}`, body);
  assert.equal((await FollowUp.findById(original._id)).completedAt.toISOString(), closed.completedAt.toISOString());
  assert.equal(await FollowUp.countDocuments({ 'formData.sourceReviewTaskId': String(review._id) }), 1);
  fs.writeFileSync(path.join(path.dirname(manifest), 'service-outcome-http.json'), JSON.stringify({ patientId: String(patient._id), originalId: String(original._id), reviewId: String(review._id), nextId: String(next._id), syntheticInputs: true }, null, 2));
  console.log('PASS actual service approval creates one manager successor and closes linked original; missing attestation blocks; retry stable');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => m.disconnect());
