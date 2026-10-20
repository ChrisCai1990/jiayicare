export const readArchiveValue = (user, path) => path.split('.').reduce((value, key) => value?.[key], user)
export const routineInputValue = (value, type) => value == null ? '' : type === 'array' && Array.isArray(value) ? value.join('\n') : String(value)

// Use the existing patient API and preserve siblings when it replaces an object.
export function buildRoutineUpdate(user, fields, values, culturalPreferencesConfirmed = false) {
  const body = {}
  for (const field of fields) {
    if (!Object.hasOwn(values, field.path)) continue
    const before = routineInputValue(readArchiveValue(user, field.path), field.type)
    const raw = String(values[field.path]).trim()
    if (raw === before.trim()) continue
    let value = raw
    if (field.type === 'number') {
      if (!raw || !Number.isFinite(Number(raw)) || Number(raw) < 0) throw new Error(`请填写有效的${field.label}`)
      value = Number(raw)
    } else if (field.type === 'array') {
      value = raw.split(/[\n、,，;；]/).map(item => item.trim()).filter(Boolean)
    } else if (field.type === 'enum' && raw && !field.options?.includes(raw)) {
      throw new Error(`请选择有效的${field.label}`)
    } else if (field.type === 'date' && raw && (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw)) || new Date(raw).toISOString().slice(0, 10) !== raw)) {
      throw new Error(`请填写有效的${field.label}`)
    }
    if (raw.length > 4000) throw new Error(`${field.label}内容过长`)
    const [root, key] = field.path.split('.')
    if (field.path === 'residence.city') body.residenceCity = value
    else if (key) {
      body[root] ||= ['carePreferences', 'lifestyle_data'].includes(root) ? { ...user[root] } : {}
      body[root][key] = value
    } else body[root] = value
  }
  if (body.ethnicity) {
    if (!culturalPreferencesConfirmed) throw new Error('请先确认客户自愿提供民族信息；也可留空')
    body.culturalPreferencesConfirmed = true
  }
  return body
}
