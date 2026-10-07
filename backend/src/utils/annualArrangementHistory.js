// Fill only proven logistics. Explicit advisor/generated fields are never replaced.
function inheritArrangements(raw, reports = [], visits = []) {
  const result = structuredClone(raw);
  for (const key of ['medical_treatment','checkup_completion','abnormal_followup','annual_checkup']) {
    const rows = Array.isArray(result[key]) ? result[key] : Array.isArray(result[key]?.records) ? result[key].records : result[key] && typeof result[key] === 'object' ? [result[key]] : [];
    for (const row of rows) {

      let match;
      if (key === 'annual_checkup') {
        match = require('./annualReviewEligibility').examReports(reports.map(r => ({ ...r, audit_status: r.audit_status || 'audited' })))
          .sort((a,b) => String(b.checkDate || '').localeCompare(String(a.checkDate || '')))[0];
      } else {
        const id = String(row.timingSourceId || '');
        match = reports.find(r => id.startsWith(`report:${r._id}:`));
        if (match) {
          const suffix = id.slice(`report:${match._id}:`.length);
          const item = (match.reportItems || []).find((v,i) => String(v.itemId || i) === suffix || String(i) === suffix);
          if (!item) match = null;
          else match = { ...match, institution: item.institution || match.institution };
        }
      }
      // A known prior same-department visit can supply a named specialist.
      // Do not copy names from unrelated departments or from a different hospital.
      const history = visits.filter(v => v.department && v.department.replace(/内科$|科$/,'') === String(row.department || '').replace(/内科$|科$/,'') && v.hospital)
        .sort((a,b) => String(b.date).localeCompare(String(a.date)))[0];
      const hospital = match?.institution || match?.hospital || history?.hospital;
      if (hospital && !row.hospital && !row.institution) {
        row.hospital = hospital;
        if (match) row.logisticsSourceReportId = String(match._id);
        if(key === 'annual_checkup') row.institution = hospital;
      }
      if (!row.expert && history && history.hospital === (row.hospital || row.institution) && history.expert && !/^(无|未知|待定|待确认|普通门诊)$/.test(history.expert)) row.expert = history.expert;
    }
  }
  return result;
}
async function loadVisits(patientId) {
  const records = await require('../models/ServiceRecord').find({patientId, aiStatus: {$ne:'pending'}, 'writeback.status': {$ne:'pending_review'}, type: {$in:['medical_visit','medical_escort']}}).select('date medicalEscort').lean();
  return records.filter(r => new Date(r.date) <= new Date()).map(r => ({date:new Date(r.date).toISOString(), hospital:r.medicalEscort?.hospital, department:r.medicalEscort?.department, expert:r.medicalEscort?.doctor}));
}
module.exports = { inheritArrangements, loadVisits };
