const clean = value => String(value || '').trim()

export function planningAdviceFromTask(task) {
  const snapshot = task?.formData?.advisorSnapshot
  return hasPlanningAdvice(snapshot) ? snapshot : task?.sourceOrderId?.medicalProxyPlan || snapshot || null
}

export function hasPlanningAdvice(plan) {
  return !!(clean(plan?.problemAnalysis) || clean(plan?.assessmentSummary)
    || [plan?.expertRecommendation1, plan?.expertRecommendation2, plan?.expertRecommendation3].some(clean))
}

export function planningAdviceMessage(plan) {
  if (!hasPlanningAdvice(plan)) return ''
  const experts = [plan.expertRecommendation1, plan.expertRecommendation2, plan.expertRecommendation3].map(clean).filter(Boolean)
  return [
    '您好，这是健康顾问整理的就医规划建议，供您与接诊医生沟通参考：',
    clean(plan.problemAnalysis || plan.assessmentSummary) && `问题分析：${clean(plan.problemAnalysis || plan.assessmentSummary)}`,
    ...experts.map((expert, index) => `推荐专家${index + 1}：${expert}`),
    clean(plan.hospitalRecommendations) && !experts.length && `建议医院：${clean(plan.hospitalRecommendations)}`,
    clean(plan.departmentRecommendations) && !experts.length && `建议科室：${clean(plan.departmentRecommendations)}`,
    clean(plan.planningRemarks) && `备注：${clean(plan.planningRemarks)}`,
    '请您看看这些建议是否符合预期。是否还需要我们协助预约、陪诊或其他就医服务？我们会根据您的意愿另行确认。',
  ].filter(Boolean).join('\n')
}
