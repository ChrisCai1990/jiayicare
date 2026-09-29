export function summaryTarget(root = {}, search = '') {
  const params = new URLSearchParams(search), year = params.get('aiYear'), scope = params.get('aiScope')
  if (!year || !['doctor', 'nutrition'].includes(scope)) return null
  const entry = root.byYear?.[year] || (Object.keys(root.byYear || {}).length ? {} : root)
  const rows = Array.isArray(entry.records) ? entry.records : entry.sections ? [entry] : []
  const stamp = params.get('aiGeneratedAt')
  const index = stamp ? rows.findIndex(r => r.generatedAt && new Date(r.generatedAt).toISOString() === stamp && (!r.scope || ['all', scope].includes(r.scope))) : Number(params.get('aiRecordIndex') || 0)
  return { year, scope, index, missing: !Number.isInteger(index) || index < 0 || index >= rows.length }
}
