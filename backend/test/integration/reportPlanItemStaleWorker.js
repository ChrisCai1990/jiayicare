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
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
