export function isCheckupDesignStage(task) {
  const stage = task?.followUpSchemeId?.workflowStageKey
  if (stage) return stage === 'plan_design'
  // Legacy records without a stage must explicitly name design, not merely an advisor role.
  return /体检方案.*(?:定制|设计|审核)/.test(task?.followUpSchemeId?.name || task?.theme || '')
}
