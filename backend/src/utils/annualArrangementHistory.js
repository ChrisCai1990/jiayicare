// Fill only proven logistics. Explicit advisor/generated fields are never replaced.
function inheritArrangements(raw, reports = []) {
  const result = structuredClone(raw);
  for (const key of ['medical_treatment','checkup_completion','abnormal_followup','annual_checkup']) {
    const rows = Array.isArray(result[key]) ? result[key] : result[key] && typeof result[key] === 'object' ? [result[key]] : [];
    for (const row of rows) {
      if (row.hospital || row.institution) continue;
      let match;
      if (key === 'annual_checkup') {
        match = reports.filter(r => r.documentCategory === 'physical_exam' || (!r.documentCategory && r.type === 'annual'))
          .sort((a,b) => String(b.checkDate || '').localeCompare(String(a.checkDate || '')))[0];
      } else {
        const id = String(row.timingSourceId || '');
        match = reports.find(r => id.startsWith(`report:${r._id}:`));
        if (match) {
          const suffix = id.slice(`report:${match._id}:`.length);
          const item = (match.reportItems || []).find((v,i) => String(v.itemId || i) === suffix);
          if (!item) match = null;
          else match = { ...match, institution: item.institution || match.institution };
        }
      }
      const hospital = match?.institution || match?.hospital;
      if (hospital) { row.hospital = hospital; row.logisticsSourceReportId = String(match._id); if(key === 'annual_checkup') row.institution = hospital; }
    }
  }
  return result;
}
module.exports = { inheritArrangements };
