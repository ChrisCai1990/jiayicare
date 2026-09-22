// Real local HTTP/auth/model boundary checks, not AI or full service fulfillment acceptance.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.equal(session.rolloutMode, 'allowlist');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  assert.ok(session.excludedPatientId && session.excludedPatientId !== session.patientId);
  const mongoose = require('mongoose');
  mongoose.set('autoIndex', false); mongoose.set('autoCreate', false);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`);
  try {
    const User = require('../../src/models/User'), FollowUp = require('../../src/models/FollowUp');
    assert.equal((await User.findById(session.patientId).lean()).name, '隔离验收客户（纯虚构）');
    assert.equal((await User.findById(session.excludedPatientId).lean()).name, '非白名单验收客户（纯虚构）');
    const tokens = {};
    async function api(route, role, method = 'GET', body) {
      const response = await fetch(session.api + route, { method, headers: { 'content-type': 'application/json', ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
      return { status: response.status, body: await response.json() };
    }
    for (const role of ['familyDoctor', 'healthManager', 'healthPlanner', 'medicalAssistant', 'superadmin']) {
      const account = session.accounts.find(a => a.role === role);
      const result = await api('/staff/login', role, 'POST', { username: account.username, password: account.password });
      assert.equal(result.status, 200); tokens[role] = result.body.data.token;
      assert.equal((await api('/staff/ai-todos', role)).status, 200, `${role} workbench`);
    }
    const evidence = [];
    for (const [patientId, enabled] of [[session.patientId, true], [session.excludedPatientId, false]]) {
      const preparation = await api(`/staff/patients/${patientId}/annual-plan-preparation`, 'familyDoctor');
      assert.equal(preparation.status, 200);
      if (!enabled) { assert.equal(preparation.body.enabled, false); assert.equal(preparation.body.data, null); }
      const generation = await api(`/staff/patients/${patientId}/ai-annual-plan`, 'familyDoctor', 'POST', {});
      assert.equal(generation.status, enabled ? 409 : 400, generation.body.message);
      const manager = session.accounts.find(a => a.role === 'healthManager');
      const task = await FollowUp.create({ patientId, staffId: manager.id, assignedTo: manager.id, date: new Date(),
        theme: '纯虚构白名单边界复查', content: '仅用于隔离边界验证', sourceType: 'scheduled', sourceScheduleKey: 'abnormal_followup:synthetic', type: 'phone', status: 'planned', aiStatus: 'approved' });
      const list = await api(`/staff/followups?patientId=${patientId}`, 'healthManager');
      assert.equal(list.status, 200);
      const item = list.body.data.followUps.find(row => row._id === String(task._id));
      assert.ok(item, 'task appears in workbench');
      assert.equal(item.healthManagementEnabled, enabled, 'server capability projected into actual API');
      const finish = await api(`/staff/followups/${task._id}`, 'healthManager', 'PUT', { status: 'completed', executedContent: '纯虚构边界测试记录' });
      assert.equal(finish.status, enabled ? 409 : 200, finish.body.message);
      assert.equal((await FollowUp.findById(task._id).lean()).status, enabled ? 'planned' : 'completed');
      const fresh = await FollowUp.findById(task._id).lean();
      const progress = await api(`/staff/followups/${task._id}/progress`, 'healthManager', 'POST', {
        requestId: 'synthetic_pilot_boundary', content: '纯虚构沟通过程', type: 'phone', updatedAt: fresh.updatedAt });
      assert.equal(progress.status, enabled ? 200 : 403, progress.body.message);
      if (!enabled) assert.equal(await FollowUp.countDocuments({ patientId, sourceType: 'annual_preparation' }), 0);
      evidence.push({ enabled, preparation: preparation.status, generation: generation.status, finish: finish.status, progress: progress.status, taskId: String(task._id) });
    }
    fs.writeFileSync(path.join(session.runtime, 'pilot-boundary-http.json'), JSON.stringify({ boundary: 'Synthetic local HTTP; no real AI/payment/notification', evidence }, null, 2));
    console.log(JSON.stringify({ passed: true, roles: 5, customers: 2, evidence }));
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
