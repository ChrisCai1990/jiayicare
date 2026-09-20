const { randomUUID } = require('node:crypto');
const { completeAuditedPlanItem } = require('./auditedPlanItem');
const { queueWrite } = require('./reportWriteFence');
const { advanceFence } = require('./reportItemEpoch');
function arm(report) {
  if (report.audit_status !== 'audited' || !report.planId || !report.planItemId) return;
  // An explicit keep-existing decision is not undone by re-saving the same audit.
  const previous = report.planItemSync;
  if (previous?.status === 'resolved' && previous.resolution?.action === 'keep_existing'
    && previous.planId === String(report.planId) && previous.itemId === String(report.planItemId)) return;
  report.planItemSync = { token: randomUUID(), status: 'pending', requestedAt: new Date(),
    planId: String(report.planId), itemId: String(report.planItemId) };
}
function createQueue({ MedicalReport, HealthPlan, now = Date.now }) {
  async function reconcile(id, token) {
    if (!token) return;
    // Single durable owner; recovery requires a target-side epoch barrier, not elapsed time alone.
    const report = await MedicalReport.findOneAndUpdate({ _id: id, 'planItemSync.token': token, 'planItemSync.status': 'pending' },
      { $set: { 'planItemSync.status': 'running', 'planItemSync.startedAt': new Date() }, $inc: { planItemWriteEpoch: 1 } }, { new: true }).lean();
    if (!report) return;
    try {
    const proof = report.planItemSync;
    let status = 'conflict';
    if (report.audit_status !== 'audited' || String(report.planId) !== proof.planId || String(report.planItemId) !== proof.itemId) status = 'obsolete';
    else {
      // Target-side fence prevents an old process (even still alive) from writing after recovery.
      if (!(await advanceFence(HealthPlan, report, report.planItemWriteEpoch))) throw new Error('Report target fence unavailable');
      const changed = await completeAuditedPlanItem(HealthPlan, report);
      const plan = await HealthPlan.findOne({ _id: report.planId, patientId: report.user }).lean();
      const item = plan?.items?.find(x => String(x._id) === String(report.planItemId));
      if (changed || (item?.status === 'completed' && String(item.reportId) === String(report._id))) status = 'completed';
    }
    await queueWrite(MedicalReport.updateOne({ _id: id, planItemWriteEpoch: report.planItemWriteEpoch, 'planItemSync.token': token, 'planItemSync.status': 'running' },
      { $set: { 'planItemSync.status': status, 'planItemSync.finishedAt': new Date() } }));
    } catch (error) {
      // A network error can leave a server-side write in flight. Fence it out before release too.
      await recover(report);
      throw error;
    }
  }
  async function safeReconcile(id, token) {
    try { await reconcile(id, token); }
    catch (error) { console.error('[report-plan-item] pending retry', String(id), error.message); }
  }
  async function scan() {
    // Legacy pre-fence running claims remain blocked: their old workers did not enforce epochs.
    // Recovery must advance the target fence BEFORE making source edits possible again.
    for await (const row of MedicalReport.find({ 'planItemSync.status': 'running', planItemWriteEpoch: { $gte: 1 },
      'planItemSync.startedAt': { $lt: new Date(now() - 5 * 60 * 1000) } }).select('_id planItemSync planItemWriteEpoch').lean().cursor()) {
      await recover(row);
    }
    // Explicit new audit intents only, bounded memory; conflicts are not retried endlessly.
    for await (const row of MedicalReport.find({ 'planItemSync.status': 'pending' }).select('_id planItemSync').lean().cursor()) {
      await safeReconcile(row._id, row.planItemSync.token);
    }
  }
  async function recover(row) {
    if (!Number.isSafeInteger(row.planItemWriteEpoch) || row.planItemWriteEpoch < 1) return;
    try {
      const report = await queueWrite(MedicalReport.findOneAndUpdate({ _id: row._id,
        planItemWriteEpoch: row.planItemWriteEpoch, 'planItemSync.token': row.planItemSync.token, 'planItemSync.status': 'running' },
      { $inc: { planItemWriteEpoch: 1 } }, { new: true })).lean();
      if (!report) return;
      if (!(await advanceFence(HealthPlan, report, report.planItemWriteEpoch))) return; // fail closed
      await queueWrite(MedicalReport.updateOne({ _id: report._id, planItemWriteEpoch: report.planItemWriteEpoch,
        'planItemSync.token': report.planItemSync.token, 'planItemSync.status': 'running' },
      { $set: { 'planItemSync.status': 'pending', 'planItemSync.recoveredAt': new Date() } }));
    } catch (error) { console.error('[report-plan-item] recovery remains locked', String(row._id), error.message); }
  }
  return { reconcile, safeReconcile, scan, recover };
}
function runtime() { return createQueue({ MedicalReport: require('../models/MedicalReport'), HealthPlan: require('../models/HealthPlan') }); }
module.exports = { arm, createQueue, runtime };
