export function supplementalAssessmentNote(value, criteria) {
  const labels = new Set(criteria.map(item => item.label))
  return String(value || '').split(/[；;\r\n]+/).map(line => line.trim()).filter(line => line && !labels.has(line)).join('\n')
}
