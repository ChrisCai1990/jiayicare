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
  const request = async (url, body, token, method = 'POST', expected = 200) => {
    const response = await fetch(session.api + url, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
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
  const uploadPlan = await HealthPlan.create({ patientId: patient._id, staffId: account.id, type: 'annual_checkup',
    title: '隔离上传关联测试（纯虚构）', items: [{ name: '合成项目A', itemType: 'specialExam' }, { name: '合成项目B', itemType: 'labTest' }] });
  const category = await require('../../src/models/ProjectCategory').create({ name: '隔离上传分类（非正式配置）' });
  const payload = { patientId: String(patient._id), title: '隔离上传占位（非真实医疗资料）', date: '2026-09-20',
    planId: String(uploadPlan._id), planItemId: String(uploadPlan.items[0]._id), screeningL1: String(category._id) };
  const countBefore = await MedicalReport.countDocuments({ user: patient._id });
  await request('/staff/medical-reports', { ...payload, patientId: session.patientId }, token, 'POST', 400);
  await request('/staff/medical-reports', { ...payload, planItemId: String(new mongoose.Types.ObjectId()) }, token, 'POST', 400);
  assert.equal(await MedicalReport.countDocuments({ user: patient._id }), countBefore);
  const first = (await request('/staff/medical-reports', payload, token)).data;
  const content = Buffer.from('Synthetic placeholder, not an actual medical report').toString('base64');
  const fill = (await request('/staff/medical-reports', { ...payload, content, mimeType: 'image/png' }, token)).data;
  assert.equal(String(fill._id), String(first._id));
  assert.equal((await MedicalReport.findById(first._id)).content, content);
  const separate = (await request('/staff/medical-reports', { ...payload, planItemId: String(uploadPlan.items[1]._id) }, token)).data;
  assert.notEqual(String(separate._id), String(first._id));
  const another = (await request('/staff/medical-reports', payload, token)).data;
  assert.notEqual(String(another._id), String(first._id));
  assert.equal(String((await readItem(uploadPlan._id)).reportId), String(first._id));
  assert.equal((await readItem(uploadPlan._id)).status, 'pending');
  console.log('upload: cross-patient/missing-item rejection, same-item empty fill, different-item separation, existing-content preservation PASS');
  const advisor = session.accounts.find(a => a.role === 'familyDoctor');
  const advisorToken = (await request('/staff/login', { username: advisor.username, password: advisor.password })).data.token;
  const assertPendingCount = async count => {
    for (const roleToken of [token, advisorToken]) {
      const rows = (await request('/staff/checkup-progress', undefined, roleToken, 'GET')).data;
      const row = rows.find(row => String(row.planId) === String(uploadPlan._id));
      if (count) assert.equal(row?.pendingCount, count);
      else assert.equal(row, undefined, 'completed plan items must leave both role progress queues');
    }
  };
  await assertPendingCount(2);
  await request(`/staff/medical-reports/${first._id}`, { aiStatus: 'reviewed' }, token, 'PATCH');
  await assertPendingCount(1);
  const firstCompleted = await readItem(uploadPlan._id);
  // The second item uses the other real audit entry, with explicitly linked synthetic content.
  const secondFill = (await request('/staff/medical-reports', { ...payload, planItemId: String(uploadPlan.items[1]._id), content, mimeType: 'image/png' }, token)).data;
  assert.equal(String(secondFill._id), String(separate._id));
  await request(`/staff/medical-reports/${separate._id}/audit`, { action: 'approve', abnormalItems: [] }, token, 'PATCH');
  await assertPendingCount(0);
  await request(`/staff/medical-reports/${first._id}`, { aiStatus: 'reviewed' }, token, 'PATCH');
  assert.equal((await readItem(uploadPlan._id)).completedAt.getTime(), firstCompleted.completedAt.getTime());
  await assertPendingCount(0);
  console.log('upload -> two audit entries -> both staff progress queues 2/1/0 -> replay stable: PASS');
  for (const entry of ['audit', 'review']) for (const scenario of ['matching', 'other_patient', 'skipped', 'other_report', 'rejected', ...(entry === 'review' ? ['draft'] : [])]) {
    const plan = await HealthPlan.create({ patientId: scenario === 'other_patient' ? new mongoose.Types.ObjectId() : patient._id,
      staffId: account.id, type: 'annual_checkup', title: `隔离项目回写-${scenario}（非真实服务）`, status: 'active',
      items: [{ name: '合成检查项（非医疗建议）', status: scenario === 'skipped' ? 'skipped' : 'pending',
        reportId: scenario === 'other_report' ? new mongoose.Types.ObjectId() : null }] });
    const report = await MedicalReport.create({ user: patient._id, title: `隔离项目回写-${scenario}（无真实报告）`,
      planId: plan._id, planItemId: plan.items[0]._id, aiStatus: 'pending',
      audit_status: entry === 'review' && scenario === 'rejected' ? 'rejected' : 'unaudited' });
    const before = await readItem(plan._id);
    const route = `/staff/medical-reports/${report._id}${entry === 'audit' ? '/audit' : ''}`;
    const body = entry === 'audit' ? { action: scenario === 'rejected' ? 'reject' : 'approve', rejectReason: '隔离负向验证', abnormalItems: [] }
      : { aiStatus: scenario === 'draft' ? 'pending' : 'reviewed' };
    await request(route, body, token, 'PATCH');
    const after = await readItem(plan._id);
    if (scenario === 'matching') {
      assert.equal(after.status, 'completed');
      assert.equal(String(after.reportId), String(report._id));
      assert.equal((await MedicalReport.findById(report._id)).audit_status, 'audited');
      await request(route, body, token, 'PATCH');
      assert.equal((await readItem(plan._id)).completedAt.getTime(), after.completedAt.getTime());
    } else assert.deepEqual(after, before, `${scenario} must not mutate the item`);
    if (entry === 'review' && scenario === 'rejected') assert.equal((await MedicalReport.findById(report._id)).audit_status, 'unaudited');
    console.log(`${entry}/${scenario}: PASS`);
  }
  console.log('Local actual audit API passed; synthetic records retained, no real AI or service acceptance.');
  const myConflicts = (await request('/staff/ai-todos', undefined, token, 'GET')).data
    .filter(row => row.type === 'report_plan_conflict' && row.patientId === String(patient._id));
  assert.equal(myConflicts.length, 6, 'two audit entries each retain cross-patient/skipped/other-report conflicts');
  assert.equal(new Set(myConflicts.map(row => row.id)).size, 6);
  assert.ok(myConflicts.every(row => row.link.includes(`patients/${patient._id}?tab=reports&reportId=`)));
  const advisorTodos = (await request('/staff/ai-todos', undefined, advisorToken, 'GET')).data;
  assert.equal(advisorTodos.some(row => row.type === 'report_plan_conflict'), false);
  const password = require('node:crypto').randomBytes(18).toString('hex');
  const username = 'isolated_unassigned_' + new mongoose.Types.ObjectId();
  await require('../../src/models/Admin').create({ username, password, name: '隔离未分配专员', role: 'healthManager' });
  const otherToken = (await request('/staff/login', { username, password })).data.token;
  const otherTodos = (await request('/staff/ai-todos', undefined, otherToken, 'GET')).data;
  assert.equal(otherTodos.some(row => row.type === 'report_plan_conflict'), false);
  console.log('conflict workbench: unique original-report rows, correct manager only, other-role/unassigned-manager excluded PASS');
  const conflict = await MedicalReport.findOne({ user: patient._id, title: /skipped/, 'planItemSync.status': 'conflict' }).lean();
  const conflictBefore = await readItem(conflict.planId);
  const resolveUrl = `/staff/medical-reports/${conflict._id}/plan-item-conflict/resolve`;
  const decision = { token: conflict.planItemSync.token, action: 'keep_existing', reason: '隔离核对：原项目明确跳过，保留现状；不声明检查完成' };
  await request(resolveUrl, decision, advisorToken, 'POST', 403);
  await request(resolveUrl, decision, otherToken, 'POST', 403);
  await request(resolveUrl, { ...decision, reason: ' ' }, token, 'POST', 400);
  await request(resolveUrl, { ...decision, token: 'stale' }, token, 'POST', 409);
  await request(resolveUrl, decision, token);
  await request(resolveUrl, decision, token, 'POST', 409);
  const resolved = await MedicalReport.findById(conflict._id).lean();
  assert.equal(resolved.planItemSync.status, 'resolved');
  assert.equal(resolved.planItemConflictResolutions.length, 1);
  assert.equal(String(resolved.planItemConflictResolutions[0].staffId), account.id);
  assert.equal(resolved.planItemConflictResolutions[0].reason, decision.reason);
  assert.deepEqual(await readItem(conflict.planId), conflictBefore);
  assert.equal(resolved.audit_status, 'audited');
  await request(`/staff/medical-reports/${conflict._id}`, { aiStatus: 'reviewed' }, token, 'PATCH');
  assert.equal((await MedicalReport.findById(conflict._id)).planItemSync.status, 'resolved');
  const afterTodos = (await request('/staff/ai-todos', undefined, token, 'GET')).data;
  assert.equal(afterTodos.some(row => row.id === 'reportplanconflict_' + conflict._id), false);
  assert.equal(afterTodos.filter(row => row.type === 'report_plan_conflict' && row.patientId === String(patient._id)).length, 5);
  console.log('conflict resolution: ownership/role/reason/version guards, one audit proof, item preserved, prompt removed and audit replay stable PASS');
  const queueModule = require('../../src/utils/reportPlanItemQueue');
  const recoveryPlan = await HealthPlan.create({ patientId: patient._id, staffId: account.id, type: 'annual_checkup',
    title: '隔离故障恢复测试', items: [{ name: '合成恢复项' }] });
  const recoveryReport = new MedicalReport({ user: patient._id, title: '隔离故障恢复合成报告', audit_status: 'audited',
    planId: recoveryPlan._id, planItemId: recoveryPlan.items[0]._id });
  queueModule.arm(recoveryReport); await recoveryReport.save();
  await assert.rejects(queueModule.createQueue({ MedicalReport, HealthPlan: { updateOne: async () => { throw new Error('injected failure before item write'); } } })
    .reconcile(recoveryReport._id, recoveryReport.planItemSync.token));
  assert.equal((await readItem(recoveryPlan._id)).status, 'pending');
  assert.equal((await MedicalReport.findById(recoveryReport._id)).planItemSync.status, 'pending');
  // Simulate interruption after item write, before the durable queue acknowledgement.
  const failingReports = { findOne: (...args) => MedicalReport.findOne(...args), updateOne: async () => { throw new Error('injected acknowledgement failure'); } };
  await assert.rejects(queueModule.createQueue({ MedicalReport: failingReports, HealthPlan }).reconcile(recoveryReport._id, recoveryReport.planItemSync.token));
  const completedAt = (await readItem(recoveryPlan._id)).completedAt.getTime();
  await queueModule.createQueue({ MedicalReport, HealthPlan }).scan();
  assert.equal((await MedicalReport.findById(recoveryReport._id)).planItemSync.status, 'completed');
  assert.equal((await readItem(recoveryPlan._id)).completedAt.getTime(), completedAt);
  console.log('persisted new audit intent: before-write failure / after-write acknowledgement failure / recovery scan idempotence PASS');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
