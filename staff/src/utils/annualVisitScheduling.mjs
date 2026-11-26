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
      title: String(row.reviewItems?.join('、') || row.items || row.name || row.reason || row.standardPlanName || '就医事项').trim(),
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

export function matchingVisitLeaders(data, moduleKey, index) {
  const rows = visitRows(data)
  const target = rows.find(row => row.moduleKey === moduleKey && row.index === index)
  if (!target?.date) return []
  return rows.filter(row => row.key !== target.key && row.date === target.date && row.hospital && (!target.hospital || row.hospital === target.hospital)
    && (row.row.serviceMode === 'single' || row.row.serviceMode === 'managed' && row.row.managedServiceType === 'outpatient'))
}

export function assignSharedVisit(data, moduleKey, index, leaderKey) {
  const rows = visitRows(data)
  const target = rows.find(row => row.moduleKey === moduleKey && row.index === index)
  const leader = matchingVisitLeaders(data, moduleKey, index).find(row => row.key === leaderKey)
  if (!target || !leader) throw new Error('没有匹配的同日同院主服务，请先核实日期、医院及服务方式')
  if (target.row.scheduleSeparationReason?.trim() || leader.row.scheduleSeparationReason?.trim()) throw new Error('已有分开安排原因或待核实条件，请核实后清除说明再关联')
  const existingIds = new Set(rows.map(row => row.row.visitGroupId).filter(Boolean))
  const base = `${leader.date} ${leader.row.hospital.trim()}同次就诊`.slice(0, 76)
  let groupId = leader.row.visitGroupId || base
  for (let suffix = 2; !leader.row.visitGroupId && existingIds.has(groupId); suffix++) groupId = `${base.slice(0, 74)}${suffix}`
  const next = { ...data }
  for (const row of [leader, target]) {
    if (!next[row.moduleKey] || next[row.moduleKey] === data[row.moduleKey]) next[row.moduleKey] = { ...data[row.moduleKey], records: [...data[row.moduleKey].records] }
    next[row.moduleKey].records[row.index] = row.key === leader.key
      ? { ...row.row, visitGroupId: groupId }
      : { ...row.row, hospital: row.row.hospital || leader.row.hospital, visitGroupId: groupId, serviceMode: 'shared', serviceType: '', managedServiceType: '',
        ...(!row.row.hospital ? { followVisitHospital: true } : {}) }
  }
  return next
}

export function syncSharedVisitProviders(data) {
  const rows = visitRows(data)
  let next = data
  for (const item of rows) {
    if (item.row.serviceMode !== 'shared' || !item.row.visitGroupId || !['checkup_completion', 'abnormal_followup'].includes(item.moduleKey)) continue
    const leaders = rows.filter(row => row.moduleKey === 'medical_treatment' && row.row.visitGroupId === item.row.visitGroupId && ['single', 'managed'].includes(row.row.serviceMode))
    if (leaders.length !== 1) continue
    const leader = leaders[0].row
    const changes = {}
    if (item.row.followVisitHospital && leader.hospital && item.row.hospital !== leader.hospital) changes.hospital = leader.hospital
    if (item.row.followVisitOrdering && leader.department) {
      if (item.row.order_dept !== leader.department) changes.order_dept = leader.department
      if (item.row.order_expert !== (leader.expert || '')) changes.order_expert = leader.expert || ''
      if (JSON.stringify(item.row.orderExpertIds || []) !== JSON.stringify(leader.expertIds || [])) changes.orderExpertIds = [...(leader.expertIds || [])]
    }
    if (!Object.keys(changes).length) continue
    if (next === data) next = { ...data }
    if (next[item.moduleKey] === data[item.moduleKey]) next[item.moduleKey] = { ...data[item.moduleKey], records: [...data[item.moduleKey].records] }
    next[item.moduleKey].records[item.index] = { ...next[item.moduleKey].records[item.index], ...changes }
  }
  return next
}

export function changeSharedVisitProvider(data, moduleKey, index, field, enabled) {
  if (!['followVisitHospital', 'followVisitOrdering'].includes(field)) return data
  const row = data[moduleKey]?.records?.[index]
  if (!row?.visitGroupId || row.serviceMode !== 'shared') return data
  const next = { ...data, [moduleKey]: { ...data[moduleKey], records: [...data[moduleKey].records] } }
  next[moduleKey].records[index] = { ...row, [field]: enabled }
  return syncSharedVisitProviders(next)
}

export function groupVisitRows(data, keys, { date, leaderKey, serviceMode, serviceType = '', trackResults = false, confirmed = true, assistedTrip = false }) {
  const rows = visitRows(data)
  const selected = rows.filter(row => keys.includes(row.key))
  if (selected.length < 2) throw new Error('请至少选择两项确属同一次就诊的事项')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('请填写有效的统一就诊日期')
  if (!selected.some(row => row.key === leaderKey)) throw new Error('请选择一次服务的主事项')
  if (!['reminder', 'single', 'managed'].includes(serviceMode)) throw new Error('请选择本次服务方式')
  if (serviceMode === 'single' && !serviceType) throw new Error('请选择单项服务内容')
  if ((serviceMode !== 'reminder' && selected.some(row => !row.hospital))
    || new Set(selected.map(row => row.hospital)).size !== 1) throw new Error('同次就诊需在同一医院；请先核实并填写医院')
  if (!assistedTrip && selected.some(row => String(row.row.scheduleSeparationReason || '').trim())) throw new Error('所选事项仍有分开安排的原因或待核实条件；请核实后清除该说明再归类')
  const selectedKeys = new Set(selected.map(row => row.key))
  if (selected.some(row => row.row.visitGroupId && rows.some(other => other.row.visitGroupId === row.row.visitGroupId && !selectedKeys.has(other.key)))) throw new Error('已有同次就诊的事项请整组选择后再调整')
  const existingIds = new Set(rows.filter(row => !selectedKeys.has(row.key)).map(row => row.row.visitGroupId).filter(Boolean))
  const base = `${date} ${String(selected[0].row.hospital || '').trim() || '医院待确认'}同次就诊`.slice(0, 76)
  let groupId = base
  for (let suffix = 2; existingIds.has(groupId); suffix++) groupId = `${base.slice(0, 74)}${suffix}`
  const next = { ...data }
  for (const row of selected) {
    if (!next[row.moduleKey] || next[row.moduleKey] === data[row.moduleKey]) next[row.moduleKey] = { ...data[row.moduleKey], records: [...data[row.moduleKey].records] }
    const leader = row.key === leaderKey
    next[row.moduleKey].records[row.index] = {
      ...row.row, ...(assistedTrip ? { followVisitOrdering: false,
        requestedVisitService: row.row.requestedVisitService || row.row.serviceType || row.row.managedServiceType || '' } : {}),
      [row.dateKey]: date, visitGroupId: groupId, visitMergeConfirmed: confirmed, appointmentSchedulingVersion: 1, ...(trackResults ? { visitResultFollowUp: true } : {}),
      serviceMode: serviceMode === 'reminder' ? 'reminder' : leader ? serviceMode : 'shared',
      serviceType: leader && serviceMode === 'single' ? serviceType : '',
      managedServiceType: leader && serviceMode === 'managed' ? 'outpatient' : '',
    }
  }
  return next
}
export function autoGroupAnnualVisits(data) {
  let next = data
  const existingGroups = new Map()
  for (const item of visitRows(data)) {
    if (!item.row.visitGroupId) continue
    if (!existingGroups.has(item.row.visitGroupId)) existingGroups.set(item.row.visitGroupId, [])
    existingGroups.get(item.row.visitGroupId).push(item)
  }
  for (const items of existingGroups.values()) {
    if (items.filter(item => ['single', 'managed'].includes(item.row.serviceMode)).length < 2 ||
        items.some(item => item.row.serviceMode === 'shared')) continue
    for (const item of items) {
      if (next[item.moduleKey] === data[item.moduleKey]) next = { ...next, [item.moduleKey]: { ...next[item.moduleKey], records: [...next[item.moduleKey].records] } }
      next[item.moduleKey].records[item.index] = { ...item.row, visitGroupId: '' }
    }
  }
  const buckets = new Map()
  for (const item of visitRows(next)) {
    if (!item.hospital || /待定|待确认|待核|或|就近/.test(item.hospital) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isFinite(Date.parse(item.date)) || new Date(item.date).toISOString().slice(0,10) !== item.date ||
        item.row.visitGroupId || item.row.datePending || item.row.scheduleSeparationReason?.trim()) continue
    const key = JSON.stringify([item.date, item.hospital])
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(item)
  }
  for (const items of buckets.values()) {
    if (items.length < 2) continue
    const leaders = items.filter(item => ['single','managed'].includes(item.row.serviceMode))
    // Separate paid services can share a date and hospital. Grouping them would
    // silently turn all but one into "shared" and drop their service requests.
    if (leaders.length > 1) continue
    const leader = leaders[0] || items[0]
    const mode = leader.row.serviceMode || 'reminder'
    if (items.some(item => !['reminder','single','managed'].includes(item.row.serviceMode || 'reminder')) ||
        leaders.some(item => item.row.serviceMode !== mode || item.row.serviceType !== leader.row.serviceType ||
          (mode === 'managed' && item.row.managedServiceType !== 'outpatient')) ||
        (mode === 'single' && !leader.row.serviceType)) continue
    next = groupVisitRows(next, items.map(item => item.key), { date: leader.date, leaderKey: leader.key, serviceMode: mode, serviceType: leader.row.serviceType, trackResults: true, confirmed: false })
  }
  return syncSharedVisitProviders(next)
}

// Each visit is a trip to one hospital. Departments remain properties of its items.
export function suggestedAssistedVisits(data) {
  const groups = new Map()
  for (const item of visitRows(data)) {
    if (!item.hospital || /待定|待确认|待核|或|就近/.test(item.hospital) || item.row.datePending ||
        !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue
    const key = JSON.stringify([item.date, item.hospital])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.values()].filter(group => group.length > 1 &&
    group.some(item => ['single', 'managed', 'shared'].includes(item.row.serviceMode)) &&
    !group.every(item => item.row.visitMergeConfirmed && item.row.visitGroupId && item.row.visitGroupId === group[0].row.visitGroupId))
}

export function nearDateCandidates(data) {
  const rows = nearbyVisitRows(data).filter(item => item.hospital && item.date && !item.row.scheduleSeparationReason?.trim() && !item.row.datePending)
  return rows.filter(item => rows.some(other => other.key !== item.key && other.hospital === item.hospital &&
    (!item.row.visitMergeConfirmed || !other.row.visitMergeConfirmed) &&
    Math.abs(Date.parse(other.date) - Date.parse(item.date)) <= 14 * 86400000))
}

export function byVisitDepartment(items, departmentFor) {
  const groups = new Map()
  for (const item of items) {
    const name = String(departmentFor(item) || '').trim() || '就诊科室待确认'
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(item)
  }
  return Array.from(groups, ([name, items]) => ({ name, items }))
}

export function addOneTimeVisit(data, reason, department, chosenKey) {
  const title = String(reason || '').trim()
  if (!title) throw new Error('请填写本次就医原因')
  const rows = visitRows(data)
  const chosen = rows.find(item => item.key === chosenKey)
  if (chosenKey && (!chosen || !chosen.date || !chosen.hospital)) throw new Error('原就医安排已变化，请重新选择')
  const confirmedGroup = chosen?.row.visitMergeConfirmed && chosen.row.visitGroupId &&
    rows.filter(item => item.row.visitGroupId === chosen.row.visitGroupId).every(item => item.row.visitMergeConfirmed)
  const assisted = confirmedGroup && rows.some(item => item.row.visitGroupId === chosen.row.visitGroupId && ['single','managed'].includes(item.row.serviceMode))
  const module = data.medical_treatment || {}
  const record = { oneTimeVisit: true, items: title, reason: title, department: String(department || '').trim(),
    serviceMode: assisted ? 'shared' : 'reminder', appointmentSchedulingVersion: 1,
    ...(chosen ? { hospital: chosen.row.hospital, visit_time: chosen.date } : {}),
    ...(confirmedGroup ? { visitGroupId: chosen.row.visitGroupId, visitMergeConfirmed: true, visitResultFollowUp: true, followVisitOrdering: false } : {}) }
  return { ...data, medical_treatment: { ...module, enabled: true, records: [...(module.records || []), record] } }
}
