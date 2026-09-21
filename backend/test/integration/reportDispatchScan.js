// Real isolated Mongo + actual child exit. No HTTP, real AI, notifications or payments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User'), Report = require('../../src/models/MedicalReport');
  const Plan = require('../../src/models/HealthPlan'), Task = require('../../src/models/Task'), Review = require('../../src/models/AbnormalReview');
  const { armLegacyDispatchIntent } = require('../../src/utils/legacyDispatchIntent');
  const { scan } = require('../../src/utils/reportDispatchQueue');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const account = session.accounts.find(a => a.role === 'healthManager');
  const staff = { _id: account.id, name: '隔离扫描健管' };
  if (process.argv[3] === '--crash') {
    const report = await Report.findById(process.argv[4]);
    assert.equal(report.title, '隔离自动接续退出');
    const plan = await Plan.findById(report.planId);
    await require('../../src/utils/conditionalReportClaim').withConditionalReportClaim(report, [plan._id], async claim => {
      if (process.argv[5] === 'after') await require('../../src/utils/conditionalDraftWrite').saveConditionalDrafts(Plan, plan, plan.toObject().content,
        [{ id: 'conditional', decision: 'not_needed', evidence: '合成已确认决定，不得覆盖' }], claim);
      process.exit(32);
    });
    return;
  }
  async function prepare(conditional) {
    const patient = await User.create({ name: '隔离扫描客户（纯虚构）', assignedHealthManager: account.id });
    const plan = conditional ? await Plan.create({ patientId: patient._id, staffId: staff._id, type: 'medical_assist', status: 'active',
      title: '隔离扫描方案', content: { workflowModules: [{ id: 'conditional', mode: 'conditional', trigger: 'abnormal_found' }] } }) : null;
    const report = new Report({ user: patient._id, title: '隔离自动接续退出', audit_status: 'audited', ...(plan ? { planId: plan._id } : {}) });
    armLegacyDispatchIntent(report, staff, { abnormalItems: [{ name: '合成项（非医疗意见）' }], reviewReason: '原持久化审核输入' });
    await report.save();
    return { report, patient, plan };
  }
  const ids = [];
  for (const phase of ['before', 'after']) {
    const { report, patient, plan } = await prepare(true); ids.push(String(report._id));
    const child = require('node:child_process').spawnSync(process.execPath, [__filename, process.argv[2], '--crash', String(report._id), phase], {
      windowsHide: true, timeout: 15000, encoding: 'utf8', env: { NODE_PATH: process.env.NODE_PATH || '', SystemRoot: process.env.SystemRoot || '', PATH: process.env.PATH || '' },
    });
    assert.equal(child.status, 32, child.stderr);
    assert.equal((await scan({ reportIds: [report._id] })).retained, 1, 'fresh lock must not be stolen');
    const results = await Promise.all([1, 2].map(() => scan({ reportIds: [report._id], now: () => Date.now() + 360000 })));
    assert.equal((await Report.findById(report._id)).legacyDispatchIntent.status, 'completed', JSON.stringify(results));
    const decided = (await Plan.findById(plan._id)).content.workflowModuleDecisions[0];
    assert.equal(decided.decision, phase === 'after' ? 'not_needed' : 'pending');
    assert.equal(await Review.countDocuments({ reportId: report._id }), 0);
    assert.equal(await Task.countDocuments({ user: patient._id }), 0);
    const saved = JSON.stringify((await Plan.findById(plan._id)).content);
    await scan({ reportIds: [report._id] });
    assert.equal(JSON.stringify((await Plan.findById(plan._id)).content), saved);
  }
  const plain = await prepare(false); ids.push(String(plain.report._id));
  await scan({ reportIds: [plain.report._id] });
  assert.equal((await Report.findById(plain.report._id)).legacyDispatchIntent.status, 'completed');
  assert.equal(await Review.countDocuments({ reportId: plain.report._id }), 1);
  assert.equal(await Task.countDocuments({ user: plain.patient._id }), 1);
  await scan({ reportIds: [plain.report._id] });
  assert.equal(await Task.countDocuments({ user: plain.patient._id }), 1);
  for (const reason of ['changed_source', 'revoked', 'unversioned_lock']) {
    const { report, patient } = await prepare(false); ids.push(String(report._id));
    if (reason === 'changed_source') report.planId = new mongoose.Types.ObjectId();
    if (reason === 'revoked') report.audit_status = 'rejected';
    if (reason === 'unversioned_lock') report.legacyReviewWrite = { status: 'running', startedAt: new Date(0) };
    await report.save();
    await scan({ reportIds: [report._id] });
    assert.equal((await Report.findById(report._id)).legacyDispatchIntent.status, 'pending');
    assert.equal(await Task.countDocuments({ user: patient._id }), 0);
  }
  console.log(JSON.stringify({ passed: true, reportIds: ids, scope: 'actual child exit / production scan function; synthetic inputs, no complete API/UI or real AI acceptance' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
