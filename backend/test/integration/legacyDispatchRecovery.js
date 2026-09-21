const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User'), Report = require('../../src/models/MedicalReport');
  const Task = require('../../src/models/Task'), Review = require('../../src/models/AbnormalReview');
  const { ensureLegacyReportReview, idFor } = require('../../src/utils/legacyReportReview');
  const { scan } = require('../../src/utils/reportDispatchQueue');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const account = session.accounts.find(a => a.role === 'healthManager');
  const staff = { _id: account.id, name: '隔离恢复健管' };
  const input = { abnormalItems: [{ name: '合成复查项（非医疗意见）' }], reviewReason: '持久化原输入' };
  const wrap = (Model, write) => new Proxy(Model, { get(target, key) {
    if (key === 'updateOne') return write;
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  if (process.argv[3] === '--crash') {
    const report = await Report.findById(process.argv[4]);
    assert.equal(report.title, '隔离旧派单恢复');
    const phase = process.argv[5];
    const wrappedReview = wrap(Review, async (...args) => {
      if (phase === 'before_review') process.exit(33);
      const value = await Review.updateOne(...args);
      if (phase === 'after_review') process.exit(33);
      return value;
    });
    const wrappedTask = wrap(Task, async (...args) => { await Task.updateOne(...args); process.exit(33); });
    await ensureLegacyReportReview({ report, staff, input, Task: wrappedTask, AbnormalReview: wrappedReview });
    return;
  }
  async function prepare() {
    const patient = await User.create({ name: '隔离派单恢复客户（纯虚构）', assignedHealthManager: account.id });
    const report = new Report({ user: patient._id, title: '隔离旧派单恢复', audit_status: 'audited' });
    require('../../src/utils/legacyDispatchIntent').armLegacyDispatchIntent(report, staff, input);
    await report.save(); return report;
  }
  const admin = session.accounts.find(a => a.role === 'superadmin');
  const loginResponse = await fetch(session.api + '/staff/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: admin.username, password: admin.password }), signal: AbortSignal.timeout(10000) });
  assert.equal(loginResponse.status, 200);
  const token = (await loginResponse.json()).data.token;
  const remove = id => fetch(session.api + '/staff/abnormal-reviews/' + id, { method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  const evidence = [];
  for (const phase of ['before_review', 'after_review', 'after_task']) {
    const report = await prepare();
    const child = require('node:child_process').spawnSync(process.execPath, [__filename, process.argv[2], '--crash', String(report._id), phase], {
      windowsHide: true, timeout: 15000, encoding: 'utf8', env: { NODE_PATH: process.env.NODE_PATH || '', SystemRoot: process.env.SystemRoot || '', PATH: process.env.PATH || '' },
    });
    assert.equal(child.status, 33, child.stderr);
    assert.equal((await Report.findById(report._id)).legacyReviewWrite.status, 'running');
    if (phase === 'after_review') assert.equal((await remove(idFor('review', report._id))).status, 409);
    assert.equal((await Report.updateOne({ _id: report._id }, { audit_status: 'rejected' })).modifiedCount, 0);
    await Promise.all([1, 2].map(() => scan({ reportIds: [report._id], now: () => Date.now() + 360000 })));
    const after = await Report.findById(report._id);
    assert.equal(after.legacyReviewWrite.status, 'completed');
    assert.equal(after.legacyDispatchIntent.status, 'completed');
    assert.equal(await Review.countDocuments({ reportId: report._id }), 1);
    assert.equal(await Task.countDocuments({ abnormalReviewId: idFor('review', report._id) }), 1);
    const task = await Task.findById(idFor('task', report._id)).lean();
    assert.equal(task.description, input.reviewReason);
    await scan({ reportIds: [report._id] });
    assert.deepEqual(await Task.findById(task._id).lean(), task);
    evidence.push({ phase, reportId: report._id });
  }
  // An old LIVE worker resumes after recovery, source revocation and removal.
  const report = await prepare();
  let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const old = ensureLegacyReportReview({ report, staff, input, Task,
    AbnormalReview: wrap(Review, async (...args) => { entered(); await gate; return Review.updateOne(...args); }) });
  await ready;
  await scan({ reportIds: [report._id], now: () => Date.now() + 360000 });
  const reviewId = idFor('review', report._id), taskId = idFor('task', report._id);
  await Task.updateOne({ _id: taskId }, { status: 'completed', completedAt: new Date() });
  const preserved = await Task.findById(taskId).lean();
  assert.equal(await Review.findByIdAndDelete(reviewId), null, 'physical delete cannot remove the insert fence');
  assert.equal((await remove(reviewId)).status, 200);
  await Report.updateOne({ _id: report._id }, { audit_status: 'rejected' });
  release(); await old;
  assert.equal(await Review.findById(reviewId), null, 'deleted review must not resurrect');
  assert.ok((await Review.findById(reviewId).setOptions({ includeAuditDeleted: true })).auditDispatchDeletedAt);
  assert.deepEqual(await Task.findById(taskId).lean(), preserved, 'completed task cannot reopen');
  assert.equal((await Report.findById(report._id)).audit_status, 'rejected');
  evidence.push({ phase: 'late_live_worker', reportId: report._id });
  const failed = await prepare();
  await assert.rejects(ensureLegacyReportReview({ report: failed, staff, input, AbnormalReview: Review,
    Task: wrap(Task, async () => { throw new Error('injected target outage'); }) }), /outage/);
  const originalWrite = Task.updateOne;
  try {
    Task.updateOne = async function (...args) { await originalWrite.apply(this, args); throw new Error('injected recovery acknowledgement loss'); };
    assert.equal((await scan({ reportIds: [failed._id], now: () => Date.now() + 360000 })).failed, 1);
    assert.equal((await Report.findById(failed._id)).legacyReviewWrite.status, 'running');
  } finally { Task.updateOne = originalWrite; }
  await scan({ reportIds: [failed._id], now: () => Date.now() + 360000 });
  assert.equal((await Report.findById(failed._id)).legacyDispatchIntent.status, 'completed');
  assert.equal(await Task.countDocuments({ abnormalReviewId: idFor('review', failed._id) }), 1);
  evidence.push({ phase: 'recovery_failure_then_retry', reportId: failed._id });
  const manual = await Review.create({ patientId: report.user, staffId: staff._id, title: '隔离人工复查删除' });
  assert.equal((await remove(manual._id)).status, 200);
  assert.equal(await Review.findById(manual._id).setOptions({ includeAuditDeleted: true }), null);
  console.log(JSON.stringify({ passed: true, evidence, scope: 'real isolated Mongo, actual child exits / live worker / scan; synthetic inputs, no real AI or UI acceptance' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
