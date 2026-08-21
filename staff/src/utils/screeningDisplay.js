const DEPARTMENT_ALIASES = [
  { label: '全科（内外科）', pattern: /^(?:全科|内科|外科|内外科)(?:检查|查体|体格检查)?$/ },
  { label: '眼科', pattern: /^(?:眼科|视力检查|眼压检查|裂隙灯检查)$/ },
  { label: '耳鼻喉科', pattern: /^(?:耳鼻喉|耳鼻咽喉)(?:科|检查)?$/ },
  { label: '口腔科', pattern: /^(?:口腔|牙科)(?:科|检查)?$/ },
  { label: '妇科', pattern: /^(?:妇科|妇科检查)$/ },
]

export function normalizeExamDepartment(value) {
  const section = String(value || '').normalize('NFKC').trim().replace(/[：:]$/, '')
  return DEPARTMENT_ALIASES.find(({ pattern }) => pattern.test(section))?.label || ''
}

// Fail closed: consolidate presentation only when every extracted row is an
// examination row carrying the same explicit supported department.
export function consolidatedExamDepartment(items) {
  if (!Array.isArray(items) || !items.length) return ''
  const departments = items.map(item => item?.itemType === 'imaging'
    ? normalizeExamDepartment(item.sourceSection)
    : '')
  if (departments.some(value => !value)) return ''
  return departments.every(value => value === departments[0]) ? departments[0] : ''
}

export function uniqueClinicalTexts(items, field) {
  return [...new Set((items || []).map(item => String(item?.[field] || '').trim()).filter(Boolean))]
}
