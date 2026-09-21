// Local real API read against an existing synthetic service/report case.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const mongoose = require('mongoose');
async function main() {
  const manifest = process.argv[2], session = JSON.parse(fs.readFileSync(manifest));
  assert.equal(session.api, 'http://127.0.0.1:3000/api'); assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false });
  const User = require('../../src/models/User'), FollowUp = require('../../src/models/FollowUp'), Link = require('../../src/models/FollowUpServiceLink');
  const Report = require('../../src/models/MedicalReport');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const service = JSON.parse(fs.readFileSync(path.join(path.dirname(manifest), 'service-http.json')));
  const roles = Object.fromEntries(session.accounts.map(a => [a.role, a]));
  const request = async (route, token, body, expected = 200) => {
    const response = await fetch(session.api + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    const json = await response.json(); assert.equal(response.status, expected, JSON.stringify(json)); return json.data;
  };
  const tokens = {};
  for (const role of ['familyDoctor', 'healthManager']) tokens[role] = (await request('/staff/login', null, { username: roles[role].username, password: roles[role].password })).token;
  const task = await FollowUp.create({ patientId: session.patientId, staffId: roles.familyDoctor.id, assignedTo: roles.healthManager.id,
    status: 'in_progress', continuityRequired: true, theme: '隔离同服务报告预选（纯虚构）' });
  const supervisor = await FollowUp.create({ patientId: session.patientId, staffId: roles.familyDoctor.id, assignedTo: roles.healthPlanner.id,
    status: 'in_progress', taskRole: 'supervisor', theme: '隔离报告关联凭据（纯虚构）' });
  await Link.create({ patientId: session.patientId, followUpId: task._id, requestTaskId: supervisor._id, targetType: 'health_plan',
    targetId: service.serviceId, title: '既有隔离体检服务', status: 'completed', linkedBy: roles.familyDoctor.id });
  const expected = await Report.find({ user: session.patientId, audit_status: 'audited', $or: [{ sourceHealthPlanId: service.serviceId }, { planId: service.serviceId }] }).select('_id').lean();
  assert.ok(expected.length, 'Existing synthetic service must have audited reports');
  const route = `/staff/followups/${task._id}/outcome-candidates`;
  await request(route, tokens.healthManager, null, 403);
  const data = await request(route, tokens.familyDoctor);
  assert.deepEqual(data.reportIds.sort(), expected.map(r => String(r._id)).sort());
  const after = await FollowUp.findById(task._id).lean();
  assert.equal(after.status, 'in_progress'); assert.equal(+after.updatedAt, +task.updatedAt);
  const unlinked = await FollowUp.create({ patientId: session.patientId, assignedTo: roles.healthManager.id, staffId: roles.familyDoctor.id,
    status: 'in_progress', continuityRequired: true, theme: '隔离无来源保护（纯虚构）' });
  assert.deepEqual((await request(`/staff/followups/${unlinked._id}/outcome-candidates`, tokens.familyDoctor)).reportIds, []);
  fs.writeFileSync(path.join(path.dirname(manifest), 'followup-candidates-http.json'), JSON.stringify({ patientId: session.patientId,
    taskId: String(task._id), serviceId: service.serviceId, reportIds: data.reportIds, draftIds: data.draftIds, noWritesOnRead: true, syntheticOnly: true }, null, 2));
  console.log(`PASS actual candidates API: ${data.reportIds.length} exact service reports; manager denied; no-source empty; original unchanged`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
