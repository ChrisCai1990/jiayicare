const { randomUUID } = require('node:crypto');
const { completeAuditedPlanItem } = require('./auditedPlanItem');
const { queueWrite } = require('./reportWriteFence');
function arm(report) {
  if (report.audit_status !== 'audited' || !report.planId || !report.planItemId) return;
  // An explicit keep-existing decision is not undone by re-saving the same audit.
  const previous = report.planItemSync;
  if (previous?.status === 'resolved' && previous.resolution?.action === 'keep_existing'
    && previous.planId === String(report.planId) && previous.itemId === String(report.planItemId)) return;
  report.planItemSync = { token: randomUUID(), status: 'pending', requestedAt: new Date(),
    planId: String(report.planId), itemId: String(report.planItemId) };
}
function createQueue({ MedicalReport, HealthPlan }) {
  async function reconcile(id, token) {
    if (!token) return;
    // Single durable owner. Never steal a running claim on elapsed time: an old process may still write.
    const report = await MedicalReport.findOneAndUpdate({ _id: id, 'planItemSync.token': token, 'planItemSync.status': 'pending' },
      { $set: { 'planItemSync.status': 'running', 'planItemSync.startedAt': new Date() } }, { new: true }).lean();
    if (!report) return;
    try {
    const proof = report.planItemSync;
    let status = 'conflict';
    if (report.audit_status !== 'audited' || String(report.planId) !== proof.planId || String(report.planItemId) !== proof.itemId) status = 'obsolete';
    else {
      const changed = await completeAuditedPlanItem(HealthPlan, report);
      const plan = await HealthPlan.findOne({ _id: report.planId, patientId: report.user }).lean();
      const item = plan?.items?.find(x => String(x._id) === String(report.planItemId));
      if (changed || (item?.status === 'completed' && String(item.reportId) === String(report._id))) status = 'completed';
    }
    await queueWrite(MedicalReport.updateOne({ _id: id, 'planItemSync.token': token, 'planItemSync.status': 'running' },
      { $set: { 'planItemSync.status': status, 'planItemSync.finishedAt': new Date() } }));
    } catch (error) {
      // Awaited operation has settled. Safe to release for normal retry; failed release stays visibly locked.
      await queueWrite(MedicalReport.updateOne({ _id: id, 'planItemSync.token': token, 'planItemSync.status': 'running' },
        { $set: { 'planItemSync.status': 'pending' } }));
      throw error;
    }
  }
  async function safeReconcile(id, token) {
    try { await reconcile(id, token); }
    catch (error) { console.error('[report-plan-item] pending retry', String(id), error.message); }
  }
  async function scan() {
    // Explicit new audit intents only, bounded memory; conflicts are not retried endlessly.
    for await (const row of MedicalReport.find({ 'planItemSync.status': 'pending' }).select('_id planItemSync').lean().cursor()) {
      await safeReconcile(row._id, row.planItemSync.token);
    }
  }
  return { reconcile, safeReconcile, scan };
}
function runtime() { return createQueue({ MedicalReport: require('../models/MedicalReport'), HealthPlan: require('../models/HealthPlan') }); }
module.exports = { arm, createQueue, runtime };
