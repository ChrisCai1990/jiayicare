const { randomUUID } = require('node:crypto');
const { queueWrite } = require('./reportWriteFence');
// Reuse the existing report write fence: no new staff task or timeout-only takeover.
async function withConditionalReportClaim(report, planIds, work) {
  const Report = require('../models/MedicalReport');
  const token = randomUUID();
  const claimed = await Report.findOneAndUpdate({ _id: report._id, user: report.user,
    audit_status: 'audited', updatedAt: report.updatedAt,
    planId: report.planId || null, sourceHealthPlanId: report.sourceHealthPlanId || null,
  }, { $set: { legacyReviewWrite: { token, kind: 'conditional_drafts', status: 'running',
    startedAt: new Date(), planIds: planIds.map(String) } } }, { new: true }).lean();
  if (!claimed) throw Object.assign(new Error('报告来源已变化或正在处理，请刷新后核对'), { status: 409, code: 'CONDITIONAL_DRAFT_CONFLICT' });
  const release = () => queueWrite(Report.updateOne({ _id: report._id,
    'legacyReviewWrite.token': token, 'legacyReviewWrite.status': 'running' },
  { $set: { 'legacyReviewWrite.status': 'completed', 'legacyReviewWrite.finishedAt': new Date() } }));
  try {
    const result = await work();
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
module.exports = { withConditionalReportClaim };
