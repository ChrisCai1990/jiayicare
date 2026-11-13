const BASE_SCOPES = {
  specialty: ['basic', 'healthProfile', 'reports'],
  medical: ['basic', 'healthProfile', 'reports'],
  checkup: ['basic', 'healthProfile', 'reports'],
  nutrition: ['basic', 'healthProfile', 'reports', 'medications'],
  daily: ['basic', 'healthProfile'],
  assessment: ['basic', 'healthProfile', 'healthRecords', 'followups'],
  annual: ['basic', 'healthProfile', 'reports', 'healthRecords', 'followups', 'plans'],
  custom: ['basic', 'healthProfile', 'reports'],
}

// The title is only a navigation hint. Staff can add or remove every scope.
export function suggestCaseReviewScopes(reviewType, title = '') {
  const scopes = new Set(BASE_SCOPES[reviewType] || BASE_SCOPES.custom)
  const name = String(title || '')
  if (/监测|趋势|波动|血压|血糖|体重|心率/.test(name)) scopes.add('healthRecords')
  if (/用药|药物|处方|营养素|补充剂|肝功能/.test(name)) scopes.add('medications')
  if (/随访|复查|执行/.test(name)) scopes.add('followups')
  if (/年度|管理方案|计划/.test(name)) scopes.add('plans')
  return [...scopes]
}
