// Real loopback HTTP/Mongo with synthetic inputs. Retain failure evidence; no external services.
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
  const Task = require('../../src/models/Task');
  const Review = require('../../src/models/AbnormalReview');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const account = session.accounts.find(a => a.role === 'healthManager');
  const request = async (path, body, token, method = 'POST') => {
    const response = await fetch(session.api + path, { method, headers: { 'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    return { status: response.status, data };
  };
  const login = await request('/staff/login', { username: account.username, password: account.password });
  assert.equal(login.status, 200);
  let failures = 0;
  for (const scenario of ['invalid_child', 'replay', 'concurrent', 'conditional_decided', 'conditional_needed', 'conditional_pending']) {
    const patient = await User.create({ name: '隔离审核副作用客户（纯虚构）', assignedHealthManager: account.id });
    const report = await Report.create({ user: patient._id, title: `隔离审核副作用-${scenario}`, audit_status: 'unaudited' });
    let conditionalPlan;
    if (scenario.startsWith('conditional_')) {
      const plan = await require('../../src/models/HealthPlan').create({ patientId: patient._id, staffId: account.id,
        type: 'medical_assist', title: '隔离已有条件决定', status: 'active', content: {
          workflowModules: [{ id: 'synthetic-condition', mode: 'conditional', trigger: 'abnormal_found' }],
          workflowModuleDecisions: scenario === 'conditional_pending' ? [] : [{ id: 'synthetic-condition',
            decision: scenario === 'conditional_needed' ? 'needed' : 'not_needed', evidence: '合成已审核决定' }],
        } });
      conditionalPlan = plan;
      report.planId = plan._id; await report.save();
    }
    const body = { action: 'approve', abnormalItems: [{ name: '合成异常（非医疗意见）', severity: scenario === 'invalid_child' ? 'invalid-test-value' : 'mild' }] };
    const statuses = [];
    if (scenario === 'concurrent') {
      const results = await Promise.all([1, 2].map(() => request(`/staff/medical-reports/${report._id}/audit`, body, login.data.data.token, 'PATCH')));
      statuses.push(...results.map(result => result.status));
    } else for (let i = 0; i < (scenario === 'replay' ? 2 : 1); i++) {
      statuses.push((await request(`/staff/medical-reports/${report._id}/audit`, body, login.data.data.token, 'PATCH')).status);
    }
    const taskCount = await Task.countDocuments({ user: patient._id });
    const reviewCount = await Review.countDocuments({ reportId: report._id });
    const audit = (await Report.findById(report._id)).audit_status;
    const safe = scenario === 'invalid_child'
      ? statuses[0] >= 400 && taskCount === 0 && reviewCount === 0 && audit === 'unaudited'
      : statuses.includes(200) && statuses.every(s => s === 200 || (scenario === 'concurrent' && s === 409)) && taskCount === (conditionalPlan ? 0 : 1)
        && reviewCount === (conditionalPlan ? 0 : 1) && audit === 'audited';
    if (conditionalPlan) {
      const savedPlan = await require('../../src/models/HealthPlan').findById(conditionalPlan._id);
      assert.equal(savedPlan.content.workflowModuleDecisions[0].decision,
        scenario === 'conditional_pending' ? 'pending' : scenario === 'conditional_needed' ? 'needed' : 'not_needed');
    }
    console.log(JSON.stringify({ scenario, safe, statuses, patientId: String(patient._id), reportId: String(report._id), taskCount, reviewCount, audit }));
    if (!safe) failures++;
  }
  const patient = await User.create({ name: '隔离半成功复查客户（纯虚构）', assignedHealthManager: account.id });
  const report = await Report.create({ user: patient._id, title: '隔离复查中断', audit_status: 'audited' });
  const { ensureLegacyReportReview } = require('../../src/utils/legacyReportReview');
  const args = { Task, AbnormalReview: Review, report, staff: { _id: account.id, name: '隔离健管' },
    input: { abnormalItems: [{ name: '合成项' }], reviewReason: '首次内容保留' } };
  await assert.rejects(ensureLegacyReportReview({ ...args, Task: { updateOne() { throw new Error('injected task failure'); } } }), /injected/);
  assert.equal(await Review.countDocuments({ reportId: report._id }), 1);
  assert.equal(await Task.countDocuments({ user: patient._id }), 0);
  assert.equal((await Report.findById(report._id)).legacyReviewWrite.status, 'running');
  assert.equal((await Report.updateOne({ _id: report._id }, { $set: { audit_status: 'rejected' } })).modifiedCount, 0);
  assert.equal((await Report.deleteOne({ _id: report._id })).deletedCount, 0);
  await assert.rejects(ensureLegacyReportReview(args), error => error.status === 409);
  assert.equal(await Task.countDocuments({ user: patient._id }), 0);
  // A distinct successful source verifies completed-task replay. Do not clear the failed lock.
  const goodReport = await Report.create({ user: patient._id, title: '隔离正常复查', audit_status: 'audited' });
  const linked = await ensureLegacyReportReview({ ...args, report: goodReport });
  const task = await Task.findById(linked.taskId);
  assert.equal(task.description, '首次内容保留');
  assert.equal(task.assignee, '隔离健管');
  task.status = 'completed'; await task.save();
  await ensureLegacyReportReview({ ...args, report: await Report.findById(goodReport._id),
    staff: { _id: account.id, name: '重试人员不得替代' }, input: { ...args.input, reviewReason: '重试不得覆盖' } });
  assert.equal((await Task.findById(linked.taskId)).status, 'completed');
  assert.equal(await Task.countDocuments({ user: patient._id }), 1);
  console.log('task failure remains locked; source edits/deletion/retry blocked; separate completed-task replay preserved PASS (automatic recovery NOT implemented)');
  const stalled = await Report.create({ user: patient._id, title: '隔离陈旧占用展示（合成时间）', audit_status: 'audited',
    legacyReviewWrite: { token: 'synthetic-stalled', status: 'running', startedAt: new Date(Date.now() - 6 * 60 * 1000) } });
  const todos = await request('/staff/ai-todos', undefined, login.data.data.token, 'GET');
  assert.equal(todos.status, 200);
  assert.equal(todos.data.data.find(row => row.id === 'reportplanconflict_' + stalled._id)?.label, '报告复查派单占用待检查');
  assert.equal((await request(`/staff/medical-reports/${stalled._id}/audit`, { action: 'reject' }, login.data.data.token, 'PATCH')).status, 409);
  console.log('synthetic aged claim appears in own workbench and audit edit returns 409 PASS');
  assert.equal(failures, 0, 'Audit side effects are not safe; synthetic evidence retained, rollout blocked');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
