const DOCTOR_SECTIONS = new Set([
  'medical_priority', 'tumor_risk', 'cardiovascular_risk',
  'chronic_disease', 'checkup_completeness',
])

function pathParts(path) {
  if (typeof path !== 'string' || !/^[a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*|\[\d+\])*$/.test(path)) return null
  const parts = path.match(/[a-zA-Z_][\w]*|\d+/g)
  return parts && DOCTOR_SECTIONS.has(parts[0]) ? parts : null
}

export function reviewConflictField(sections, path) {
  const parts = pathParts(path)
  if (!parts) return null
  let value = sections
  for (const part of parts) {
    if (value == null || !Object.hasOwn(value, part)) return null
    value = value[part]
  }
  return typeof value === 'string' ? value : null
}

export function changedReviewConflictSection(sections, path, text) {
  const parts = pathParts(path)
  if (!parts || typeof text !== 'string' || reviewConflictField(sections, path) === null) return null
  const sectionKey = parts[0]
  const section = structuredClone(sections[sectionKey])
  let target = section
  for (const part of parts.slice(1, -1)) target = target[part]
  target[parts.at(-1)] = text
  return { sectionKey, section }
}
