const { randomUUID } = require('node:crypto');
const { queueWrite } = require('./reportWriteFence');
const { advanceFence } = require('./reportItemEpoch');
// Reuse the existing report write fence: no new staff task or timeout-only takeover.
async function withConditionalReportClaim(report, planIds, work) {
  const Report = require('../models/MedicalReport');
  const token = randomUUID();
  const claimed = await Report.findOneAndUpdate({ _id: report._id, user: report.user,
    audit_status: 'audited', updatedAt: report.updatedAt,
    planId: report.planId || null, sourceHealthPlanId: report.sourceHealthPlanId || null,
  }, { $set: { legacyReviewWrite: { token, kind: 'conditional_drafts', status: 'running',
    startedAt: new Date(), fenceVersion: 1, planIds: planIds.map(String) } }, $inc: { planItemWriteEpoch: 1 } }, { new: true }).lean();
  if (!claimed) throw Object.assign(new Error('报告来源已变化或正在处理，请刷新后核对'), { status: 409, code: 'CONDITIONAL_DRAFT_CONFLICT' });
  const release = () => queueWrite(Report.updateOne({ _id: report._id,
    planItemWriteEpoch: claimed.planItemWriteEpoch,
    'legacyReviewWrite.token': token, 'legacyReviewWrite.status': 'running' },
  { $set: { 'legacyReviewWrite.status': 'completed', 'legacyReviewWrite.finishedAt': new Date() } }));
  try {
    const Plan = require('../models/HealthPlan');
    for (const planId of planIds) {
      if (!await advanceFence(Plan, { ...claimed, planId }, claimed.planItemWriteEpoch)) throw new Error('条件草稿目标屏障不可用');
    }
    const result = await work(claimed);
    const released = await release();
    if (released.modifiedCount !== 1) throw new Error('条件草稿回执未确认，请核查处理状态');
    return result;
  } catch (error) {
    // A confirmed CAS miss has no in-flight target write. All earlier awaited
    // writes have settled; leave the intent pending for an explicit safe retry.
    // Unknown errors/timeouts keep the source frozen until fenced recovery exists.
    if (error.code === 'CONDITIONAL_DRAFT_CONFLICT') await release();
    throw error;
  }
}
// Only claims written by the fenced implementation can be recovered. Keep the
// source frozen until EVERY target has invalidated any late/old worker writes.
async function recoverConditionalClaim(row) {
  if (row.legacyReviewWrite?.kind !== 'conditional_drafts' || row.legacyReviewWrite?.fenceVersion !== 1
      || row.legacyReviewWrite.status !== 'running' || row.legacyDispatchIntent?.status !== 'pending'
      || !Array.isArray(row.legacyReviewWrite.planIds) || !row.legacyReviewWrite.planIds.length
      || !Number.isSafeInteger(row.planItemWriteEpoch) || row.planItemWriteEpoch < 1) return false;
  const Report = require('../models/MedicalReport'), Plan = require('../models/HealthPlan');
  const claimed = await queueWrite(Report.findOneAndUpdate({ _id: row._id,
    planItemWriteEpoch: row.planItemWriteEpoch, 'legacyReviewWrite.token': row.legacyReviewWrite.token,
    'legacyReviewWrite.status': 'running', 'legacyDispatchIntent.status': 'pending',
  }, { $inc: { planItemWriteEpoch: 1 } }, { new: true })).lean();
  if (!claimed) return false;
  for (const planId of claimed.legacyReviewWrite.planIds || []) {
    if (!await advanceFence(Plan, { ...claimed, planId }, claimed.planItemWriteEpoch)) return false;
  }
  const released = await queueWrite(Report.updateOne({ _id: claimed._id,
    planItemWriteEpoch: claimed.planItemWriteEpoch, 'legacyReviewWrite.token': claimed.legacyReviewWrite.token,
    'legacyReviewWrite.status': 'running',
  }, { $set: { 'legacyReviewWrite.status': 'interrupted', 'legacyReviewWrite.recoveredAt': new Date() } }));
  return released.modifiedCount === 1;
}
module.exports = { withConditionalReportClaim, recoverConditionalClaim };
