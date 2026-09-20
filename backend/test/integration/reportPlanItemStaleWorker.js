// Deterministic fault scheduling on isolated real Mongo; no AI or clinical acceptance.
// Exit nonzero whenever an obsolete audit snapshot can still complete an item.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const User = require('../../src/models/User');
  const HealthPlan = require('../../src/models/HealthPlan');
  const MedicalReport = require('../../src/models/MedicalReport');
  const { arm, createQueue } = require('../../src/utils/reportPlanItemQueue');
  assert.equal((await User.findById(session.patientId).lean()).name, '隔离验收客户（纯虚构）');
  const manager = session.accounts.find(a => a.role === 'healthManager');
  if (process.argv[3] === '--crash-worker') {
    const report = await MedicalReport.findById(process.argv[4]).lean();
    assert.equal(report.title, '隔离进程硬退出报告');
    const crashPlan = { findOne: (...args) => HealthPlan.findOne(...args), updateOne: async (...args) => {
      if (args[0].items && process.argv[5] === 'before') process.exit(23);
      const result = await HealthPlan.updateOne(...args);
      if (args[0].items && process.argv[5] === 'after') process.exit(24);
      return result;
    } };
    await createQueue({ MedicalReport, HealthPlan: crashPlan }).reconcile(report._id, report.planItemSync.token);
    throw new Error('Expected hard exit was not reached');
  }
  const patient = await User.create({ name: '隔离旧快照竞争客户（纯虚构）', assignedHealthManager: manager.id });
  let failures = 0;
  for (const scenario of ['audit_revoked', 'association_changed']) {
    const plan = await HealthPlan.create({ patientId: patient._id, staffId: manager.id, type: 'annual_checkup',
      title: `隔离旧快照-${scenario}`, items: [{ name: '原合成项目', status: 'pending' }, { name: '另一合成项目', status: 'pending' }] });
    const report = new MedicalReport({ user: patient._id, title: `隔离旧快照-${scenario}`, audit_status: 'audited',
      planId: plan._id, planItemId: plan.items[0]._id });
    arm(report); await report.save();
    let injected = false, sourceWrite;
    const guardedPlan = {
      findOne: (...args) => HealthPlan.findOne(...args),
      updateOne: async (...args) => {
        // Queue has read its report snapshot. Change durable source before its item write.
        if (!injected) {
          injected = true;
          // An already-loaded document cannot bypass the fence through save or deletion either.
          const staleDocument = await MedicalReport.findById(report._id);
          staleDocument.audit_status = 'rejected';
          await assert.rejects(staleDocument.save(), /No document found|not found/i);
          assert.equal((await MedicalReport.deleteOne({ _id: report._id })).deletedCount, 0);
          const duplicate = await MedicalReport.findOneAndUpdate({ _id: report._id, 'planItemSync.status': 'pending' },
            { $set: { 'planItemSync.status': 'running' } }, { new: true });
          assert.equal(duplicate, null);
          sourceWrite = await MedicalReport.updateOne({ _id: report._id }, { $set: scenario === 'audit_revoked'
            ? { audit_status: 'rejected' }
            : { planItemId: plan.items[1]._id, 'planItemSync.token': 'synthetic-new-version', 'planItemSync.status': 'conflict' } });
        }
        return HealthPlan.updateOne(...args);
      },
    };
    await createQueue({ MedicalReport, HealthPlan: guardedPlan }).reconcile(report._id, report.planItemSync.token);
    const result = await HealthPlan.findById(plan._id).lean();
    const source = await MedicalReport.findById(report._id).lean();
    const sourceUnchanged = source.audit_status === 'audited' && String(source.planItemId) === String(plan.items[0]._id);
    const safe = result.items[0].status === 'pending' || (sourceWrite?.modifiedCount === 0 && sourceUnchanged);
    if (!safe) failures++;
    console.log(JSON.stringify({ scenario, safe, reportId: String(report._id), planId: String(plan._id),
      originalItemStatus: result.items[0].status, sourceAudit: source.audit_status, sourceSync: source.planItemSync.status }));
  }
  if (failures) throw new Error(`${failures} stale-snapshot safety checks FAILED; synthetic evidence retained, do not approve rollout`);
  // Keep the old worker alive, paused immediately before its item write, while recovery revokes its epoch.
  const plan = await HealthPlan.create({ patientId: patient._id, staffId: manager.id, type: 'annual_checkup',
    title: '隔离迟到写入恢复', items: [{ name: '合成恢复目标', status: 'pending' }] });
  const report = new MedicalReport({ user: patient._id, title: '隔离迟到写入报告', audit_status: 'audited',
    planId: plan._id, planItemId: plan.items[0]._id });
  arm(report); await report.save();
  let enterWrite, releaseWrite;
  const entered = new Promise(resolve => { enterWrite = resolve; });
  const released = new Promise(resolve => { releaseWrite = resolve; });
  const delayedPlan = { findOne: (...args) => HealthPlan.findOne(...args), updateOne: async (...args) => {
    if (args[0].items) { enterWrite(); await released; }
    return HealthPlan.updateOne(...args);
  } };
  const oldWork = createQueue({ MedicalReport, HealthPlan: delayedPlan }).reconcile(report._id, report.planItemSync.token);
  await entered;
  const frozen = await MedicalReport.findById(report._id).lean();
  const queue = createQueue({ MedicalReport, HealthPlan });
  await queue.recover(frozen);
  const recovered = await MedicalReport.findById(report._id).lean();
  assert.equal(recovered.planItemSync.status, 'pending');
  assert.ok(recovered.planItemWriteEpoch > frozen.planItemWriteEpoch);
  assert.equal(await require('../../src/utils/reportItemEpoch').advanceFence(HealthPlan, frozen, frozen.planItemWriteEpoch), false, 'old worker cannot downgrade target fence');
  await MedicalReport.updateOne({ _id: report._id }, { $set: { audit_status: 'rejected' } });
  releaseWrite(); await oldWork;
  assert.equal((await HealthPlan.findById(plan._id).lean()).items[0].status, 'pending');
  assert.equal((await MedicalReport.findById(report._id).lean()).audit_status, 'rejected');
  await queue.reconcile(report._id, report.planItemSync.token);
  assert.equal((await MedicalReport.findById(report._id).lean()).planItemSync.status, 'obsolete');
  console.log('live old worker after recovery: old target write and old acknowledgement fenced out, revoked report stays uncompleted PASS');
  for (const phase of ['before', 'after']) {
    const crashPlan = await HealthPlan.create({ patientId: patient._id, staffId: manager.id, type: 'annual_checkup',
      title: `隔离进程硬退出-${phase}`, items: [{ name: '合成中断目标', status: 'pending' }] });
    const crashReport = new MedicalReport({ user: patient._id, title: '隔离进程硬退出报告', audit_status: 'audited',
      planId: crashPlan._id, planItemId: crashPlan.items[0]._id });
    arm(crashReport); await crashReport.save();
    const child = require('node:child_process').spawnSync(process.execPath, [__filename, process.argv[2], '--crash-worker', String(crashReport._id), phase], {
      windowsHide: true, timeout: 15000, encoding: 'utf8',
      env: { NODE_PATH: process.env.NODE_PATH || '', SystemRoot: process.env.SystemRoot || '', PATH: process.env.PATH || '' },
    });
    assert.equal(child.status, phase === 'before' ? 23 : 24, child.stderr);
    const stranded = await MedicalReport.findById(crashReport._id).lean();
    assert.equal(stranded.planItemSync.status, 'running');
    const beforeRecovery = (await HealthPlan.findById(crashPlan._id).lean()).items[0];
    assert.equal(beforeRecovery.status, phase === 'before' ? 'pending' : 'completed');
    // Advance only the scanner clock, not persisted clinical or scheduling dates.
    await createQueue({ MedicalReport, HealthPlan, now: () => Date.now() + 6 * 60 * 1000 }).scan();
    const afterRecovery = (await HealthPlan.findById(crashPlan._id).lean()).items[0];
    assert.equal(afterRecovery.status, 'completed');
    if (phase === 'after') assert.equal(afterRecovery.completedAt.getTime(), beforeRecovery.completedAt.getTime());
    assert.equal((await MedicalReport.findById(crashReport._id).lean()).planItemSync.status, 'completed');
    console.log(`actual child hard-exit ${phase} item write -> fenced recovery -> completed, no duplicate completion: PASS`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
