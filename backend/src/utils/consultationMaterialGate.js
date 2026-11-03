const MedicalReport = require('../models/MedicalReport');
module.exports = async function materialGate(row, referral) {
  const ids = [...new Set([...(row.materialReportIds || []).map(String), ...(referral?.attachedHealthInfo?.screeningRecords || []).map(r => r.来源报告编号).filter(Boolean)])];
  if (!ids.length) return '';
  const reports = await MedicalReport.find({ _id: { $in:ids }, user:row.patientId }).select('_id title audit_status').lean();
  if (reports.length !== ids.length) return '部分所选报告不存在或不属于本客户，请在客户报告中核实';
  const pending = reports.filter(r => r.audit_status !== 'audited');
  return pending.length ? `以下报告尚未审核通过：${pending.map(r=>r.title || '未命名报告').join('、')}。请在客户报告中完成审核后提交。` : '';
};
