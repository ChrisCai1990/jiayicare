function summarizeCheckupPlan(plan, reports = []) {
  if (!plan) return { applicable: false, ready: true };
  const items = (plan.items || []).filter(item => String(item.name || '').trim());
  const audited = new Set(reports.filter(report => report.audit_status === 'audited').map(report => String(report._id)));
  const pending = items.filter(item => item.status !== 'completed' || !item.reportId || !audited.has(String(item.reportId)))
    .map(item => ({ id: String(item._id), name: item.name,
      reason: item.status !== 'completed' ? '项目尚未核对完成'
        : !item.reportId ? '已标记完成，但未关联报告'
          : '关联报告未通过当前审核' }));
  return {
    applicable: true, ready: items.length > 0 && pending.length === 0,
    planId: String(plan._id), planTitle: plan.title,
    total: items.length, completed: items.length - pending.length, pending,
  };
}

async function checkupAnalysisReadiness(patientId, year) {
  const HealthPlan = require('../models/HealthPlan');
  const MedicalReport = require('../models/MedicalReport');
  // Drafts are preparation material; only a pushed plan can gate analysis.
  const plan = await HealthPlan.findOne({
    patientId, type: 'annual_checkup',
    checkupDate: { $gte: new Date(Date.UTC(Number(year), 0, 1)), $lt: new Date(Date.UTC(Number(year) + 1, 0, 1)) },
    status: { $in: ['active', 'completed'] }, pushedAt: { $ne: null },
  }).sort({ createdAt: -1 }).select('title items status').lean();
  if (!plan) return summarizeCheckupPlan(null);

  const items = (plan.items || []).filter(item => String(item.name || '').trim());
  const reportIds = items.map(item => item.reportId).filter(Boolean);
  const reports = reportIds.length
    ? await MedicalReport.find({ _id: { $in: reportIds }, user: patientId, archiveOnly: { $ne: true } })
      .select('_id audit_status').lean()
    : [];
  return summarizeCheckupPlan(plan, reports);
}

module.exports = { checkupAnalysisReadiness, summarizeCheckupPlan };
