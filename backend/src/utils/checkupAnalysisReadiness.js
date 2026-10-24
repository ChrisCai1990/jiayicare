function summarizeCheckupPlan(plan, reports = []) {
  if (!plan) return { applicable: false, ready: true };
  const items = (plan.items || []).filter(item => String(item.name || '').trim());
  const audited = new Set(reports.filter(report => report.audit_status === 'audited').map(report => String(report._id)));
  const pending = items.filter(item => item.status !== 'completed' || !item.reportId || !audited.has(String(item.reportId)))
    .map(item => ({ id: String(item._id), name: item.name }));
  return {
    applicable: true, ready: items.length > 0 && pending.length === 0,
    planId: String(plan._id), planTitle: plan.title,
    total: items.length, completed: items.length - pending.length, pending,
  };
}

async function checkupAnalysisReadiness(patientId, year) {
  const HealthPlan = require('../models/HealthPlan');
  const MedicalReport = require('../models/MedicalReport');
  const plan = await HealthPlan.findOne({
    patientId, type: 'annual_checkup', year: Number(year), status: { $ne: 'cancelled' },
  }).sort({ createdAt: -1 }).select('title items status').lean();
  if (!plan) return summarizeCheckupPlan(null);

  const items = (plan.items || []).filter(item => String(item.name || '').trim());
  const reportIds = items.map(item => item.reportId).filter(Boolean);
  const reports = reportIds.length
    ? await MedicalReport.find({ _id: { $in: reportIds }, user: patientId })
      .select('_id audit_status').lean()
    : [];
  return summarizeCheckupPlan(plan, reports);
}

module.exports = { checkupAnalysisReadiness, summarizeCheckupPlan };
