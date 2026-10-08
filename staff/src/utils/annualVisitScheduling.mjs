export const VISIT_DATE_FIELDS = { medical_treatment: 'visit_time', checkup_completion: 'time', abnormal_followup: 'time' }

export function hospitalIdentity(value) {
  const name = String(value || '').trim().replace(/[\s（）()·・]/g, '')
  return /^(?:浙二医院|浙大二院|浙江大学医学院附属二院|浙江大学医学院附属第二医院)$/.test(name)
    ? '浙江大学医学院附属第二医院' : name
}

export function visitRows(data = {}) {
  return Object.entries(VISIT_DATE_FIELDS).flatMap(([moduleKey, dateKey]) =>
    data[moduleKey]?.enabled === false ? [] : (data[moduleKey]?.records || []).map((row, index) => ({
      key: `${moduleKey}:${index}`, moduleKey, index, dateKey, row,
      date: String(row[dateKey] || ''), hospital: hospitalIdentity(row.hospital),
      title: String(row.items || row.name || row.reason || row.standardPlanName || '就医事项').trim(),
    })))
}

export function nearbyVisitRows(data = {}) {
  const rows = visitRows(data).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.key.localeCompare(b.key))
  let cluster = 0
  let lastDate = ''
  return rows.map(row => {
    const gap = lastDate && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && /^\d{4}-\d{2}-\d{2}$/.test(lastDate)
      ? (Date.parse(`${row.date}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86400000 : Infinity
    if (gap > 14) cluster += 1
    lastDate = row.date
    return { ...row, cluster }
  })
}

export function changeVisitDate(data, moduleKey, index, date) {
  const rows = visitRows(data)
  const target = rows.find(row => row.moduleKey === moduleKey && row.index === index)
  if (!target) return data
  const groupId = String(target.row.visitGroupId || '').trim()
  const next = { ...data }
  const affected = groupId ? rows.filter(row => String(row.row.visitGroupId || '').trim() === groupId) : [target]
  for (const row of affected) {
    if (!next[row.moduleKey] || next[row.moduleKey] === data[row.moduleKey]) next[row.moduleKey] = { ...data[row.moduleKey], records: [...data[row.moduleKey].records] }
    next[row.moduleKey].records[row.index] = { ...row.row, [row.dateKey]: date, appointmentSchedulingVersion: 1 }
  }
  return next
}

export function changeVisitSeparationReason(data, moduleKey, index, reason) {
  const module = data[moduleKey]
  if (!module?.records?.[index]) return data
  const records = [...module.records]
  records[index] = { ...records[index], scheduleSeparationReason: reason }
  return { ...data, [moduleKey]: { ...module, records } }
}

export function groupVisitRows(data, keys, { date, leaderKey, serviceMode, serviceType = '' }) {
  const rows = visitRows(data)
  const selected = rows.filter(row => keys.includes(row.key))
  if (selected.length < 2) throw new Error('请至少选择两项确属同一次就诊的事项')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('请填写有效的统一就诊日期')
  if (!selected.some(row => row.key === leaderKey)) throw new Error('请选择一次服务的主事项')
  if (!['single', 'managed'].includes(serviceMode)) throw new Error('请选择本次服务方式')
  if (serviceMode === 'single' && !serviceType) throw new Error('请选择单项服务内容')
  if (selected.some(row => !row.hospital) || new Set(selected.map(row => row.hospital)).size !== 1) throw new Error('同次就诊需在同一医院；请先核实并填写医院')
  if (selected.some(row => String(row.row.scheduleSeparationReason || '').trim())) throw new Error('所选事项仍有分开安排的原因或待核实条件；请核实后清除该说明再归类')
  const selectedKeys = new Set(selected.map(row => row.key))
  if (selected.some(row => row.row.visitGroupId && rows.some(other => other.row.visitGroupId === row.row.visitGroupId && !selectedKeys.has(other.key)))) throw new Error('已有同次就诊的事项请整组选择后再调整')
  const existingIds = new Set(rows.filter(row => !selectedKeys.has(row.key)).map(row => row.row.visitGroupId).filter(Boolean))
  const base = `${date} ${selected[0].row.hospital.trim()}同次就诊`.slice(0, 76)
  let groupId = base
  for (let suffix = 2; existingIds.has(groupId); suffix++) groupId = `${base.slice(0, 74)}${suffix}`
  const next = { ...data }
  for (const row of selected) {
    if (!next[row.moduleKey] || next[row.moduleKey] === data[row.moduleKey]) next[row.moduleKey] = { ...data[row.moduleKey], records: [...data[row.moduleKey].records] }
    const leader = row.key === leaderKey
    next[row.moduleKey].records[row.index] = {
      ...row.row, [row.dateKey]: date, visitGroupId: groupId, appointmentSchedulingVersion: 1,
      serviceMode: leader ? serviceMode : 'shared',
      serviceType: leader && serviceMode === 'single' ? serviceType : '',
      managedServiceType: leader && serviceMode === 'managed' ? 'outpatient' : '',
    }
  }
  return next
}
