// List-only simplification: clinical qualifications (e.g. contrast MRI) stay intact.
export function serviceTaskTitle(task) {
  const title = String(task?.theme || '')
  // 兼容已创建的旧专家约诊任务：它们曾错误沿用“医疗代诊”前缀。订单名称是
  // 可靠的业务事实，列表展示应以它为准，避免专员误判服务类型。
  const serviceName = String(task?.sourceOrderId?.serviceName || '')
  const isExpertAppointment = /专家约诊/.test(serviceName || title)
  const normalized = isExpertAppointment && !/医疗代诊/.test(serviceName)
    ? title.replace(/^医疗代诊(?=[：:])/, '专家约诊')
    : title
  if (!task?.careFlowId) return normalized
  return normalized.replace(/\s*[（(]重点(?:观察|关注)[^）)]*[）)]?\s*$/, '').trim()
}
