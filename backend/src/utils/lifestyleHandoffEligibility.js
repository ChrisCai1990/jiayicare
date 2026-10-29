const DIETARY_SURVEY_QUESTIONNAIRE_ID = '6a49eab9fc1595013da70645';

function completedInServicePeriod(user, access) {
  if (!access?.startDate) return false;
  const start = Date.parse(`${access.startDate}T00:00:00Z`);
  const end = access.endDate ? Date.parse(`${access.endDate}T23:59:59Z`) : Infinity;
  if (!Number.isFinite(start)) return false;
  const byYear = user?.aiHealthSummary?.byYear || {};
  return Object.values(byYear).some(entry => {
    const records = Array.isArray(entry.records) ? entry.records : entry.sections ? [entry] : [];
    return records.some(record => {
      if (!record.sections?.lifestyle_assessment) return false;
      const approved = record.nutritionApprovedAt || (!record.scope && record.approvedAt);
      const time = Date.parse(approved);
      return Number.isFinite(time) && time >= start && time <= end;
    });
  });
}

async function lifestyleGenerationEligible(user, year, deps = {}) {
  if (!user || user.isDeleted || !user.assignedNutritionist) return false;
  const root = user.aiHealthSummary || {};
  const entry = root.byYear?.[String(year)] || (!Object.keys(root.byYear || {}).length
    && root.sections && new Date(root.generatedAt || 0).getFullYear() === Number(year) ? root : null);
  const records = Array.isArray(entry?.records) ? entry.records : entry?.sections ? [entry] : [];
  const latestDoctor = records.find(record => record.sections
    && (!record.scope || ['doctor', 'all'].includes(record.scope))
    && ['medical_priority', 'tumor_risk', 'cardiovascular_risk', 'chronic_disease', 'checkup_completeness']
      .some(key => record.sections[key] && Object.keys(record.sections[key]).length));
  const approvedAt = Date.parse(latestDoctor?.doctorApprovedAt || latestDoctor?.approvedAt);
  const archiveConfirmedAt = Date.parse(user.archiveReviewSnapshotAt);
  if (!Number.isFinite(approvedAt) || (Number.isFinite(archiveConfirmedAt) && approvedAt < archiveConfirmedAt)) return false;
  const access = await (deps.resolveServiceAccess || require('./serviceAccess').resolveServiceAccess)(user);
  if (!access?.active || completedInServicePeriod(user, access)) return false;
  const rights = await (deps.getAiEntitlements || require('./packageFeatureEntitlements').getAiEntitlements)(user, access);
  if (!rights.aiHealthAnalysis) return false;
  const checkup = await (deps.checkupAnalysisReadiness || require('./checkupAnalysisReadiness').checkupAnalysisReadiness)(user._id, year);
  if (!checkup.ready) return false;
  const reportGate = await (deps.checkReportAuditGate || require('./reportAuditGate').checkReportAuditGate)(user._id);
  if (reportGate) return false;
  const dietaryPending = await (deps.dietaryPending || (patientId => require('../models/QuestionnaireResponse').exists({
    user: patientId, questionnaire: DIETARY_SURVEY_QUESTIONNAIRE_ID,
    'nutritionistReview.status': { $ne: 'reviewed' },
  })))(user._id);
  return !dietaryPending;
}

module.exports = { lifestyleGenerationEligible, completedInServicePeriod };
