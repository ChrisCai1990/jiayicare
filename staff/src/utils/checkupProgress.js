const idOf = value => String(value?._id || value || '')

export function checkupServiceMode(plan) {
  const content = plan?.content || {}
  return content.serviceMode === 'one_stop' || content.serviceScene === 'checkup_one_stop'
    || /一站式/.test(`${plan?.title || ''} ${content.templateName || ''}`)
    ? '体检一站式服务' : '单独体检服务'
}

export function groupCheckupPlans(plans = []) {
  const byId = new Map(plans.map(plan => [idOf(plan._id), plan]))
  const groups = new Map()
  for (const plan of plans) {
    const linkedId = idOf(plan.checkupServiceId || plan.content?.serviceInstanceId)
    const service = byId.get(linkedId)
    const valid = plan.type === 'annual_checkup' && service?.type === 'medical_assist'
      && service.content?.serviceDomain === 'annual_checkup'
      && idOf(service.patientId) === idOf(plan.patientId) && idOf(plan.patientId)
    const key = valid ? linkedId : idOf(plan._id)
    if (!groups.has(key)) groups.set(key, { plan: valid ? service : plan, members: [] })
    groups.get(key).members.push(plan)
  }
  return [...groups.values()].sort((a, b) => String(b.plan.createdAt || '').localeCompare(String(a.plan.createdAt || '')))
}

export function belongsToCheckupPlan(record, plan) {
  if (!plan?._id) return false
  const ids = [idOf(plan._id), idOf(plan.content?.serviceInstanceId)].filter(Boolean)
  return [record.sourceHealthPlanId, record.planId].some(value => value && ids.includes(idOf(value)))
}

export function checkupProgress(plan, tasks = []) {
  const own = tasks.filter(task => belongsToCheckupPlan(task, plan))
  const stageTask = (key, pattern) => own.find(task => task.followUpSchemeId?.workflowStageKey
    ? task.followUpSchemeId.workflowStageKey === key : pattern.test(task.theme || ''))
  if (plan?.status === 'cancelled') return { stage: -1, title: '本次体检服务已取消', hint: '保留原执行记录；如需继续服务，请由所属团队确认后续安排。' }
  if (plan?.status === 'completed') return { stage: 6, title: '本次体检服务已完成', hint: '可查看报告、评估与验收记录；后续事项以已审核的新计划为准。' }
  const stages = [
    ['final_acceptance', /最终验收/, 6, '健康规划师核对最终验收', '核对结果评估、客户沟通及遗留事项，不重复办理已完成环节。'],
    ['result_review', /结果评估与随访计划/, 5, '健康顾问评估体检结果', '依据已审核报告确认本次结果及后续安排。'],
    ['report_collection', /报告.*(?:回收|获取|归档)/, 4, '核对体检报告及审核进度', '报告回收完成不等于评估和最终验收已完成。'],
    ['onsite', /现场|陪同体检|体检日陪诊/, 3, '跟进体检现场执行', '按本次已确认预约安排执行并回流资料。'],
    ['booking', /体检预约|预约.*体检/, 2, '健康规划师办理体检预约', '准备结果已进入预约环节，无需重复要求客户确认方案。'],
  ]
  for (const [key, pattern, stage, title, hint] of stages) {
    const task = stageTask(key, pattern)
    if (task && !task.isBlocked && task.status !== 'cancelled') return { stage, title, hint }
  }
  if (plan?.confirmedAt) return { stage: 2, title: '客户已确认体检方案，待衔接预约', hint: '由健康规划师核对本次服务承接与预约安排。' }
  if (plan?.pushedAt) return { stage: 1, title: '方案已发送，等待客户确认', hint: '客户确认后再衔接预约准备。' }
  if (plan?.content?.checkupIntake?.status === 'submitted') return { stage: 1, title: '健康顾问核对需求并完善体检方案', hint: '复用已提交资料，核对本次体检需求。' }
  return { stage: 0, title: '等待本次体检准备资料', hint: '尚无可确认的本次执行进度，请核对资料及服务安排。' }
}
