const ACTIVE = ['planned', 'in_progress', 'missed']
const latest = items => [...items].sort((a, b) => new Date(b.completedAt || b.updatedAt || b.createdAt || b.date) - new Date(a.completedAt || a.updatedAt || a.createdAt || a.date))[0]

export function executionCategoryOf(task) {
  if (['insurance_case', 'insurance_service'].includes(task.sourceType) || /高端医疗险/.test(`${task.theme || ''} ${(task.tags || []).join(' ')}`)) return 'insurance'
  const serviceName = task.sourceOrderId?.serviceName || task.sourceHealthPlanId?.title || ''
  if (task.sourceType === 'supply_reminder' || task.sourceOrderId?.medicalProxyPlan?.medicationProxy || task.sourceOrderId?.medicalProxyPlan?.supplementProxy || (task.tags || []).includes('配药与营养补充')) return 'supply'
  // Order identity takes precedence over stage descriptions. Every stage of one
  // service must belong to the same category.
  if (serviceName) {
    if (/代配药|代取药|代配营养素|配药与营养补充/.test(serviceName)) return 'supply'
    if (/专家约诊|就医|会诊|医院|挂号|陪诊|代诊|门诊/.test(serviceName)) return 'medical'
    if (/体检|复查|检验|检查|筛查|疫苗/.test(serviceName)) return 'checkup'
    if (/营养|饮食|膳食|体重管理/.test(serviceName)) return 'nutrition'
  }
  if (task.sourceHealthPlanId?.type === 'medical_assist') return 'medical'
  const content = `${task.theme || ''} ${task.content || task.taskRequirements || task.plannedContent || ''} ${task.type || ''} ${task.sourceType || ''}`
  if (/营养|饮食|膳食|体重管理/.test(content)) return 'nutrition'
  if (/体检|复查|检验|检查|筛查|疫苗/.test(content)) return 'checkup'
  if (/专家约诊|约诊|就医|会诊|医院|挂号|陪诊|代诊|科室|医生/.test(content)) return 'medical'
  if (/血压|血糖|体重|睡眠|运动|饮水|监测|打卡/.test(content)) return 'monitoring'
  if (/专病|慢病|疾病管理/.test(content)) return 'disease'
  return 'communication'
}

export function buildExecutionRows(tasks, isServiceTask, serviceGroupKey) {
  const serviceGroups = new Map()
  const monitorGroups = new Map()
  const rows = []
  for (const task of tasks) {
    if (isServiceTask(task)) {
      const key = serviceGroupKey(task)
      if (!serviceGroups.has(key)) {
        const row = { type: 'order_service', key, items: [] }
        serviceGroups.set(key, row)
        rows.push(row)
      }
      serviceGroups.get(key).items.push(task)
    } else if (task.sourceType === 'scheduled' && (task.theme || '').startsWith('日常监测随访 · ')) {
      const key = `${task.theme}|${task.status}`
      if (!monitorGroups.has(key)) {
        const row = { type: 'group', key, theme: task.theme, status: task.status, items: [] }
        monitorGroups.set(key, row)
        rows.push(row)
      }
      monitorGroups.get(key).items.push(task)
    } else rows.push({ type: 'single', item: task })
  }
  return rows
}

export function executionServiceCurrentTask(row) {
  if (row.items.some(item => ['insurance_case', 'insurance_service'].includes(item.sourceType) || /高端医疗险/.test(item.theme || ''))) {
    return latest(row.items.filter(item => item.taskRole === 'executor' && ACTIVE.includes(item.status)))
      || latest(row.items.filter(item => ['in_progress', 'missed'].includes(item.status)))
      || latest(row.items.filter(item => item.status === 'planned')) || latest(row.items)
  }
  const orderStatus = row.items.find(item => item.sourceOrderId?.status)?.sourceOrderId?.status
  const planStatus = row.items.find(item => item.sourceHealthPlanId?.status)?.sourceHealthPlanId?.status
  if (orderStatus === 'completed' || planStatus === 'completed') return latest(row.items.filter(item => item.status === 'completed')) || latest(row.items)
  if (orderStatus === 'cancelled' || planStatus === 'cancelled') return latest(row.items.filter(item => item.status === 'cancelled')) || latest(row.items)
  return row.items.find(item => /:supervise$/.test(item.workflowKey || '') && ACTIVE.includes(item.status))
    || row.items.find(item => ACTIVE.includes(item.status)) || latest(row.items)
}

export function executionRowStatus(row) {
  if (row.type === 'group') return row.status
  if (row.type === 'single') return row.item.status
  if (row.items.some(item => ['insurance_case', 'insurance_service'].includes(item.sourceType) || /高端医疗险/.test(item.theme || ''))) {
    if (row.items.some(item => ['in_progress', 'missed'].includes(item.status))) return 'in_progress'
    if (row.items.some(item => item.status === 'planned')) return 'planned'
    if (row.items.some(item => item.status === 'completed')) return 'completed'
    return 'cancelled'
  }
  const orderStatus = row.items.find(item => item.sourceOrderId?.status)?.sourceOrderId?.status
  const planStatus = row.items.find(item => item.sourceHealthPlanId?.status)?.sourceHealthPlanId?.status
  if (orderStatus === 'completed' || planStatus === 'completed') return 'completed'
  if (orderStatus === 'cancelled' || planStatus === 'cancelled') return 'cancelled'
  return executionServiceCurrentTask(row)?.status || 'planned'
}

export function executionRowCategory(row) {
  if (row.type === 'single') return executionCategoryOf(row.item)
  if (row.type === 'group') return executionCategoryOf(row.items[0])
  const identified = row.items.find(item => item.sourceOrderId?.serviceName || item.sourceHealthPlanId?.title)
  return executionCategoryOf(identified || executionServiceCurrentTask(row))
}
