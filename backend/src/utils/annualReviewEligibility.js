// Annual review requires a reviewed physical exam, not merely a recent upload.
function day(value) {
  const m = String(value || '').match(/^(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d.toISOString().slice(0,10) : '';
}
function eligibility(reports, now = new Date()) {
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0,10);
  const [y,m,d] = today.split('-').map(Number);
  const cutoff = new Date(Date.UTC(y-1,m-1,Math.min(d,new Date(Date.UTC(y-1,m,0)).getUTCDate()))).toISOString().slice(0,10);
  const latest = reports.filter(r => r.audit_status === 'audited' && (r.documentCategory === 'physical_exam' || (!r.documentCategory && r.type === 'annual')))
    .map(r => ({ reportId: String(r._id || ''), date: day(r.checkDate || r.date) }))
    .filter(r => r.date && r.date <= today).sort((a,b) => b.date.localeCompare(a.date))[0];
  return { allowed: Boolean(latest && latest.date >= cutoff), latest: latest || null, cutoff,
    message: '近12个月内没有已审核的有效体检资料，请先完成体检并录入审核后，再发起年度管理研判。' };
}
async function check(patientId) {
  const reports = await require('../models/MedicalReport').find({ user: patientId, audit_status: 'audited' })
    .select('_id type documentCategory checkDate date audit_status').lean();
  return eligibility(reports);
}
module.exports = { day, eligibility, check };
