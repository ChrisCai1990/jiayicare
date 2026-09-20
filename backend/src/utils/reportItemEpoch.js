const fencePath = reportId => `reportItemWriteFences.${String(reportId)}`;
async function advanceFence(HealthPlan, report, epoch) {
  if (!Number.isSafeInteger(epoch) || epoch < 1 || !report.planId) throw new Error('Invalid report write epoch');
  const path = fencePath(report._id);
  const result = await HealthPlan.updateOne({ _id: report.planId,
    $or: [{ [path]: { $exists: false } }, { [path]: { $lte: epoch } }] }, { $set: { [path]: epoch } });
  return result.matchedCount === 1;
}
module.exports = { fencePath, advanceFence };
