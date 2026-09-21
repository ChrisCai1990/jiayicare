// Compare the actual snapshot, not a timestamp with millisecond collisions.
// This protects the target plan only; source-report fencing remains separate.
async function saveConditionalDrafts(HealthPlan, plan, snapshot, decisions, claim) {
  const fence = claim ? { [require('./reportItemEpoch').fencePath(claim._id)]: claim.planItemWriteEpoch } : {};
  const result = await HealthPlan.updateOne({ _id: plan._id, patientId: plan.patientId,
    status: plan.status, content: snapshot, ...fence }, { $set: { 'content.workflowModuleDecisions': decisions } });
  if (result.matchedCount !== 1) {
    throw Object.assign(new Error('方案或条件审核决定已变化，请刷新后重试；已确认结果不会被草稿覆盖'),
      { status: 409, code: 'CONDITIONAL_DRAFT_CONFLICT' });
  }
}
module.exports = { saveConditionalDrafts };
