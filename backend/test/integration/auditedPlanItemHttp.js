// Synthetic inputs, actual local audit HTTP + Mongo. No clinical/AI acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const db = mongoose.connection.db;
  const oid = value => new mongoose.Types.ObjectId(value);
  assert.equal((await db.collection('users').findOne({ _id: oid(session.patientId) })).name, '隔离验收客户（纯虚构）');
  const account = session.accounts.find(a => a.role === 'healthManager');
  const request = async (url, body, token, method = 'POST') => {
    const response = await fetch(session.api + url, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };
  const token = (await request('/staff/login', { username: account.username, password: account.password })).data.token;
  const HealthPlan = require('../../src/models/HealthPlan');
  const MedicalReport = require('../../src/models/MedicalReport');
  const User = require('../../src/models/User');
  const patient = await User.create({ name: '隔离项目回写客户（纯虚构）',
    assignedHealthManager: account.id, assignedFamilyDoctor: session.accounts.find(a => a.role === 'familyDoctor').id,
    assignedHealthPlanner: session.accounts.find(a => a.role === 'healthPlanner').id });
  const readItem = async id => (await HealthPlan.findById(id).lean()).items[0];
  for (const scenario of ['matching', 'other_patient', 'skipped', 'other_report', 'rejected']) {
    const plan = await HealthPlan.create({ patientId: scenario === 'other_patient' ? new mongoose.Types.ObjectId() : patient._id,
      staffId: account.id, type: 'annual_checkup', title: `隔离项目回写-${scenario}（非真实服务）`, status: 'active',
      items: [{ name: '合成检查项（非医疗建议）', status: scenario === 'skipped' ? 'skipped' : 'pending',
        reportId: scenario === 'other_report' ? new mongoose.Types.ObjectId() : null }] });
    const report = await MedicalReport.create({ user: patient._id, title: `隔离项目回写-${scenario}（无真实报告）`,
      planId: plan._id, planItemId: plan.items[0]._id, aiStatus: 'pending' });
    const before = await readItem(plan._id);
    await request(`/staff/medical-reports/${report._id}/audit`, { action: scenario === 'rejected' ? 'reject' : 'approve', rejectReason: '隔离负向验证', abnormalItems: [] }, token, 'PATCH');
    const after = await readItem(plan._id);
    if (scenario === 'matching') {
      assert.equal(after.status, 'completed');
      assert.equal(String(after.reportId), String(report._id));
      assert.equal((await MedicalReport.findById(report._id)).audit_status, 'audited');
      await request(`/staff/medical-reports/${report._id}/audit`, { action: 'approve', abnormalItems: [] }, token, 'PATCH');
      assert.equal((await readItem(plan._id)).completedAt.getTime(), after.completedAt.getTime());
    } else assert.deepEqual(after, before, `${scenario} must not mutate the item`);
    console.log(`${scenario}: PASS`);
  }
  console.log('Local actual audit API passed; synthetic records retained, no real AI or service acceptance.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
