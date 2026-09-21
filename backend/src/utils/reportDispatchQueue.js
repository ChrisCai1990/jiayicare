// Replay only explicit persisted audit intents; never infer work from historical reports.
const { draftConditionalModulesFromAuditedReport } = require('./reportConditionalDrafts');
const { recoverConditionalClaim } = require('./conditionalReportClaim');
function sourceMatches(report, intent) {
  return intent?.source?.patientId === String(report.user)
    && intent.source.planId === String(report.planId || '')
    && intent.source.sourceHealthPlanId === String(report.sourceHealthPlanId || '');
}
async function dispatch(report, staff, input) {
  const Report = require('../models/MedicalReport');
  const intent = report.legacyDispatchIntent;
  if (intent && !sourceMatches(report, intent)) throw Object.assign(new Error('复查待办来源已变更，请核对原审核记录，不自动改派'), { status: 409 });
  if (intent?.status === 'completed') return;
  if (report.audit_status !== 'audited') return;
  const payload = intent?.input || input;
  const conditional = await draftConditionalModulesFromAuditedReport(report, payload?.abnormalItems || []);
  if (payload?.abnormalItems?.length && !conditional.hasConditionalModules) {
    await require('./legacyReportReview').ensureLegacyReportReview({
      Task: require('../models/Task'), AbnormalReview: require('../models/AbnormalReview'),
      report, staff: intent?.staff || staff, input: payload,
    });
  }
  if (intent) {
    // Claim writes update updatedAt. Re-read only the source version held at successful completion.
    const current = await Report.findById(report._id).lean();
    if (!current || !sourceMatches(current, intent) || current.audit_status !== 'audited') return;
    await Report.updateOne({ _id: report._id, updatedAt: current.updatedAt,
      'legacyDispatchIntent.token': intent.token, 'legacyDispatchIntent.status': 'pending', audit_status: 'audited',
    }, { $set: { 'legacyDispatchIntent.status': 'completed', 'legacyDispatchIntent.completedAt': new Date(),
      'legacyDispatchIntent.outcome': conditional.hasConditionalModules ? 'conditional_workflow' : 'legacy_review' } });
  }
}
async function scan({ now = Date.now, reportIds } = {}) {
  const Report = require('../models/MedicalReport');
  const scope = reportIds ? { _id: { $in: reportIds } } : {};
  const result = { completed: 0, retained: 0, failed: 0 };
  for await (const row of Report.find({ ...scope, audit_status: 'audited', 'legacyDispatchIntent.status': 'pending' }).lean().cursor()) {
    try {
      if (!sourceMatches(row, row.legacyDispatchIntent) || !row.legacyDispatchIntent.staff?._id
          || !row.legacyDispatchIntent.input?.abnormalItems?.length) { result.retained++; continue; }
      if (row.planItemSync?.status === 'running') { result.retained++; continue; }
      if (row.legacyReviewWrite?.status === 'running') {
        const started = new Date(row.legacyReviewWrite.startedAt).getTime();
        if (!Number.isFinite(started) || started > now() - 5 * 60 * 1000
            || !await recoverConditionalClaim(row)) { result.retained++; continue; }
      }
      const fresh = await Report.findById(row._id);
      if (!fresh || fresh.legacyDispatchIntent?.status !== 'pending') continue;
      await dispatch(fresh);
      const after = await Report.findById(row._id).lean();
      if (after?.legacyDispatchIntent?.status === 'completed') result.completed++;
      else result.retained++;
    } catch (error) {
      result.failed++;
      console.error('[report-dispatch] retained for retry', String(row._id), error.message);
    }
  }
  return result;
}
module.exports = { dispatch, scan, sourceMatches };
