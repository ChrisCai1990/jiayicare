const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User'), Plan = require('../../src/models/HealthPlan'), Report = require('../../src/models/MedicalReport');
  assert.equal((await User.findById(session.patientId)).name, '隔离验收客户（纯虚构）');
  const { withConditionalReportClaim, recoverConditionalClaim } = require('../../src/utils/conditionalReportClaim');
  const { saveConditionalDrafts } = require('../../src/utils/conditionalDraftWrite');
  if (process.argv[3] === '--crash') {
    const target = await Report.findById(process.argv[4]);
    assert.equal(target.title, '隔离条件真实退出');
    const targetPlan = await Plan.findById(target.planId);
    await withConditionalReportClaim(target, [targetPlan._id], async claim => {
      if (process.argv[5] === 'after') await saveConditionalDrafts(Plan, targetPlan, targetPlan.toObject().content, [{ id: 'crash', decision: 'pending' }], claim);
      process.exit(31);
    });
    return;
  }
  const plan = await Plan.create({ patientId: session.patientId, staffId: session.accounts[0].id, type: 'medical_assist', status: 'active', title: '隔离条件屏障恢复', content: { workflowModuleDecisions: [] } });
  const report = await Report.create({ user: session.patientId, planId: plan._id, title: '隔离条件旧执行者', audit_status: 'audited', legacyDispatchIntent: { status: 'pending', token: 'synthetic-recovery' } });
  let oldClaim;
  await assert.rejects(withConditionalReportClaim(report, [plan._id], async claim => { oldClaim = claim; throw new Error('injected write uncertainty'); }), /uncertainty/);
  const stuck = await Report.findById(report._id).lean();
  assert.equal(stuck.legacyReviewWrite.status, 'running');
  const recovered = await Promise.all([recoverConditionalClaim(stuck), recoverConditionalClaim(stuck)]);
  assert.equal(recovered.filter(Boolean).length, 1);
  assert.equal((await Report.findById(report._id)).legacyReviewWrite.status, 'interrupted');
  await assert.rejects(saveConditionalDrafts(Plan, plan, plan.toObject().content, [{ id: 'old', decision: 'pending' }], oldClaim), error => error.code === 'CONDITIONAL_DRAFT_CONFLICT');
  assert.equal((await Plan.findById(plan._id)).content.workflowModuleDecisions.length, 0);
  await withConditionalReportClaim(await Report.findById(report._id), [plan._id], claim => saveConditionalDrafts(Plan, plan, plan.toObject().content, [{ id: 'new', decision: 'pending' }], claim));
  assert.equal((await Plan.findById(plan._id)).content.workflowModuleDecisions[0].id, 'new');
  const fresh = await Report.create({ user: session.patientId, title: '隔离无屏障旧占用', audit_status: 'audited', legacyReviewWrite: { kind: 'conditional_drafts', status: 'running' }, legacyDispatchIntent: { status: 'pending' } });
  assert.equal(await recoverConditionalClaim(fresh.toObject()), false);
  for (const phase of ['before', 'after']) {
    const crashPlan = await Plan.create({ patientId: session.patientId, staffId: session.accounts[0].id, type: 'medical_assist', status: 'active', title: '隔离条件真实退出方案', content: { workflowModuleDecisions: [] } });
    const crashReport = await Report.create({ user: session.patientId, planId: crashPlan._id, title: '隔离条件真实退出', audit_status: 'audited', legacyDispatchIntent: { status: 'pending', token: 'synthetic-crash-' + phase } });
    const child = require('node:child_process').spawnSync(process.execPath, [__filename, process.argv[2], '--crash', String(crashReport._id), phase], {
      windowsHide: true, timeout: 15000, encoding: 'utf8', env: { NODE_PATH: process.env.NODE_PATH || '', SystemRoot: process.env.SystemRoot || '', PATH: process.env.PATH || '' },
    });
    assert.equal(child.status, 31, child.stderr);
    const crashed = await Report.findById(crashReport._id).lean();
    assert.equal(crashed.legacyReviewWrite.status, 'running');
    assert.equal(await recoverConditionalClaim(crashed), true);
    assert.equal((await Plan.findById(crashPlan._id)).content.workflowModuleDecisions.length, phase === 'after' ? 1 : 0);
    assert.equal((await Report.findById(crashReport._id)).legacyDispatchIntent.status, 'pending');
    console.log(JSON.stringify({ phase, actualExit: child.status, recovery: true, reportId: crashReport._id }));
  }
  console.log(JSON.stringify({ passed: true, reportId: report._id, planId: plan._id, scope: 'actual Mongo, competing recoverers, stale writes and real child exit before/after target write; automatic scan NOT implemented' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
