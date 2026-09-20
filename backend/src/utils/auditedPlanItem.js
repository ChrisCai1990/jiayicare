// Call only after the report audit has been persisted. Replays preserve completion time.
async function completeAuditedPlanItem(HealthPlan, report) {
  if (report.audit_status !== 'audited' || !report.user || !report.planId || !report.planItemId || !report._id) return false;
  const result = await HealthPlan.updateOne({
    _id: report.planId, patientId: report.user, status: { $ne: 'cancelled' },
    items: { $elemMatch: { _id: report.planItemId, status: 'pending',
      $or: [{ reportId: null }, { reportId: report._id }] } },
  }, { $set: { 'items.$.status': 'completed', 'items.$.completedAt': new Date(), 'items.$.reportId': report._id } });
  return result.modifiedCount === 1;
}
module.exports = { completeAuditedPlanItem };
