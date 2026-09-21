// Actual child-process exit after atomic audit+intent save; loopback synthetic data only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User');
  const Report = require('../../src/models/MedicalReport');
  const Review = require('../../src/models/AbnormalReview');
  const Task = require('../../src/models/Task');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const manager = session.accounts.find(a => a.role === 'healthManager');
  if (process.argv[3] === '--crash-after-save') {
    const report = await Report.findById(process.argv[4]);
    assert.equal(report.title, '隔离审核保存后硬退出');
    assert.equal(report.audit_status, 'unaudited');
    report.audit_status = 'audited';
    require('../../src/utils/legacyDispatchIntent').armLegacyDispatchIntent(report, { _id: manager.id, name: '隔离首次审核人员' },
      { abnormalItems: [{ name: '合成项目（非医疗意见）' }], reviewReason: '硬退出前已保存的原始输入' });
    await report.save();
    process.exit(29);
  }
  const patient = await User.create({ name: '隔离硬退出审核客户（纯虚构）', assignedHealthManager: manager.id });
  const report = await Report.create({ user: patient._id, title: '隔离审核保存后硬退出', audit_status: 'unaudited' });
  const child = require('node:child_process').spawnSync(process.execPath,
    [__filename, process.argv[2], '--crash-after-save', String(report._id)], {
      windowsHide: true, timeout: 15000, encoding: 'utf8',
      env: { NODE_PATH: process.env.NODE_PATH || '', SystemRoot: process.env.SystemRoot || '', PATH: process.env.PATH || '' },
    });
  assert.equal(child.status, 29, child.stderr);
  const durable = await Report.findById(report._id);
  assert.equal(durable.audit_status, 'audited');
  assert.equal(durable.legacyDispatchIntent.status, 'pending');
  assert.equal(await Review.countDocuments({ reportId: report._id }), 0);
  assert.equal(await Task.countDocuments({ user: patient._id }), 0);
  const request = async (path, body, token, method = 'POST') => {
    const response = await fetch(session.api + path, { method, headers: { 'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };
  const token = (await request('/staff/login', { username: manager.username, password: manager.password })).data.token;
  // Explicit audit replay through the real API, NOT an automatic recovery scan.
  for (let i = 0; i < 2; i++) {
    const result = await request(`/staff/medical-reports/${report._id}/audit`,
      { action: 'approve', abnormalItems: [], reviewReason: '重试输入不得替代首次输入' }, token, 'PATCH');
    assert.equal(result.data.legacyDispatchIntent.token, durable.legacyDispatchIntent.token);
    assert.equal(result.data.legacyDispatchIntent.status, 'completed');
  }
  const review = await Review.findOne({ reportId: report._id });
  const task = await Task.findOne({ user: patient._id });
  assert.equal(await Review.countDocuments({ reportId: report._id }), 1);
  assert.equal(await Task.countDocuments({ user: patient._id }), 1);
  assert.equal(review.reviewReason, '硬退出前已保存的原始输入');
  assert.equal(task.description, review.reviewReason);
  assert.equal(task.assignee, '隔离首次审核人员');
  console.log(JSON.stringify({ reportId: String(report._id), hardExit: 29, durableInputRetained: true,
    explicitHttpReplay: 'PASS', uniqueChildren: true, automaticRecovery: 'NOT_IMPLEMENTED' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
