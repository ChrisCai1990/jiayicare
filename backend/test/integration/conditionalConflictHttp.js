const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User'), Plan = require('../../src/models/HealthPlan');
  const Report = require('../../src/models/MedicalReport'), Task = require('../../src/models/Task');
  const Review = require('../../src/models/AbnormalReview');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const manager = session.accounts.find(row => row.role === 'healthManager');
  const request = async (path, body, token, method = 'POST') => {
    const response = await fetch(session.api + path, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    return { status: response.status, body: await response.json() };
  };
  const login = await request('/staff/login', { username: manager.username, password: manager.password });
  assert.equal(login.status, 200);
  const patient = await User.create({ name: '隔离HTTP条件竞争客户（纯虚构）', assignedHealthManager: manager.id });
  const plan = await Plan.create({ patientId: patient._id, staffId: manager.id, title: '隔离HTTP条件竞争（仅测试）', type: 'medical_assist', status: 'active', content: {
    workflowModules: [{ id: 'condition', mode: 'conditional', trigger: 'abnormal_found' }], workflowModuleDecisions: [], note: '原内容',
  } });
  const report = await Report.create({ user: patient._id, planId: plan._id, title: '隔离条件冲突HTTP报告', audit_status: 'unaudited' });
  const input = { action: 'approve', abnormalItems: [{ name: '合成异常', severity: 'mild' }] };
  const first = await request(`/staff/medical-reports/${report._id}/audit`, input, login.body.data.token, 'PATCH');
  assert.equal(first.status, 409, JSON.stringify(first));
  assert.equal(first.body.code, 'CONDITIONAL_DRAFT_CONFLICT');
  const pending = await Report.findById(report._id);
  assert.equal(pending.audit_status, 'audited');
  assert.equal(pending.legacyDispatchIntent.status, 'pending');
  const retry = await request(`/staff/medical-reports/${report._id}/audit`, input, login.body.data.token, 'PATCH');
  assert.equal(retry.status, 200, JSON.stringify(retry));
  const saved = await Plan.findById(plan._id);
  assert.equal(saved.content.workflowModuleDecisions[0].decision, 'not_needed');
  assert.equal(saved.content.note, '并发人工修改保留');
  assert.equal(await Task.countDocuments({ user: patient._id }), 0);
  assert.equal(await Review.countDocuments({ reportId: report._id }), 0);
  assert.equal((await Report.findById(report._id)).legacyDispatchIntent.status, 'completed');
  console.log(JSON.stringify({ passed: true, reportId: report._id, planId: plan._id, statuses: [409, 200], scope: 'actual HTTP with deterministic synthetic target-write interleaving; not automatic recovery' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
