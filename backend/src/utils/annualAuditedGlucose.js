const MedicalReport = require('../models/MedicalReport');

async function latestAuditedGlucose(patientId, year) {
  const reports = await MedicalReport.find({ user: patientId, audit_status: 'audited', checkDate: { $lte: `${year}-12-31` } })
    .sort({ checkDate: -1, createdAt: -1 }).limit(80).select('checkDate reportItems.name reportItems.value reportItems.status').lean();
  for (const report of reports) {
    const item = (report.reportItems || []).find(row => /(?:HbA1c|糖化血红蛋白A1c)/i.test(String(row.name || '')));
    if (item) return { date: String(report.checkDate || '').slice(0, 10), value: String(item.value || ''), status: item.status };
  }
  return null;
}

module.exports = { latestAuditedGlucose };
