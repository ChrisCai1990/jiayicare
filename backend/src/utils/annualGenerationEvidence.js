// Keep the confirmed review as the decision source. The full audited timeline stays
// on the server for date and HbA1c validation; the model receives recent examples
// rather than every repeated historical lab row.
function compactReportTimeline(timeline = [], focusText = '') {
  const structural = /(?:CT|磁共振|MRI|超声|彩超|胃镜|肠镜|病理|结节|斑块|腺瘤|息肉)/i;
  const glucose = /(?:HbA1c|糖化血红蛋白)/i;
  const abnormal = /(?:abnormal|high|low|positive|异常|阳性)/i;
  const abnormalGroups = new Set(timeline.filter(row => abnormal.test(String(row.status || ''))).map(row => String(row.group || row.name || row.id)));
  const relevantGroups = new Set(timeline.filter(row => {
    const label = `${row.name || ''} ${row.reportTitle || ''}`;
    const name = String(row.name || '').trim();
    const title = String(row.reportTitle || '').trim();
    return structural.test(label) || glucose.test(label)
      || abnormal.test(String(row.status || ''))
      || (name.length >= 2 && focusText.includes(name))
      || (title.length >= 4 && focusText.includes(title));
  }).map(row => String(row.group || row.name || row.id)));
  const counts = new Map();
  return timeline.filter(row => {
    const group = String(row.group || row.name || row.id);
    if (!relevantGroups.has(group)) return false;
    const count = counts.get(group) || 0;
    const compareHistory = glucose.test(row.name || '') ? 3 : structural.test(`${row.name || ''} ${row.reportTitle || ''}`) || abnormalGroups.has(group) ? 2 : 1;
    if (count >= compareHistory) return false;
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
