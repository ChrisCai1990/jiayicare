export function isCheckupDesignStage(task) {
  const stage = task?.followUpSchemeId?.workflowStageKey
  if (stage) return stage === 'plan_design'
  // Legacy records without a stage must explicitly name design, not merely an advisor role.
  return /体检方案.*(?:定制|设计|审核)/.test(task?.followUpSchemeId?.name || task?.theme || '')
}

export function checkupConclusionStage(task) {
  if (task?.sourceType !== 'health_plan') return ''
  const stage = task?.followUpSchemeId?.workflowStageKey
  if (stage) return ['result_review', 'final_acceptance'].includes(stage) ? stage : ''
  const name = task?.followUpSchemeId?.name || task?.theme || ''
  if (/体检.*结果评估/.test(name)) return 'result_review'
  if (/体检.*最终验收/.test(name)) return 'final_acceptance'
  return ''
}
