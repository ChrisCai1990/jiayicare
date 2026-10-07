// Keep the confirmed review as the decision source. The full audited timeline stays
// on the server for date and HbA1c validation; the model receives recent examples
// rather than every repeated historical lab row.
function compactReportTimeline(timeline = []) {
  const counts = new Map();
  return timeline.filter(row => {
    const group = String(row.group || row.name || row.id);
    const count = counts.get(group) || 0;
    const compareHistory = /(?:HbA1c|糖化血红蛋白|病理|CT|磁共振|胃镜|肠镜|超声|结节|斑块)/i.test(`${row.name || ''} ${row.reportTitle || ''}`);
    if (count >= (compareHistory ? 2 : 1)) return false;
    counts.set(group, count + 1);
    return true;
  }).map(row => ({ id: row.id, date: row.date, dateSource: row.dateSource, name: row.name, reportTitle: row.reportTitle, group: row.group, result: row.result }));
}

function compactHealthSummary(sections = {}) {
  const present = row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
  return {
    medicalPriority: (sections.medical_priority?.items || []).map(({ name, current, action, urgency, department }) => present({ name, current, action, urgency, department })),
    tumorFindings: sections.tumor_risk?.abnormal || [],
    cardiovascularFindings: sections.cardiovascular_risk?.high || [],
    chronicFindings: (sections.chronic_disease?.items || []).filter(item => ['abnormal', 'mild_abnormal'].includes(item.status))
      .map(({ name, latest, current, value, trend, meaning, action, status }) => present({ name, latest, current, value, trend, meaning, action, status })),
    missingCheckups: sections.checkup_completeness?.missing || [],
  };
}

module.exports = { compactReportTimeline, compactHealthSummary };
