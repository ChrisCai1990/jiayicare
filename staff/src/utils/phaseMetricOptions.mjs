export const dailyMetricGroups = {
  '日常指标': ['血压', '体重'],
  '血糖': ['空腹血糖', '餐后血糖'],
  '排便': ['排便形态', '排便次数'],
  '睡眠': ['入睡时间', '夜间醒来情况', '晨醒时间', '睡眠时长', '睡眠质量'],
  '精力': ['日间精力'],
}

export function annualMetricOptions(plans) {
  const names = new Set()
  for (const plan of plans) {
    if (!plan.pushedAt || plan.returnedAt && new Date(plan.returnedAt) >= new Date(plan.pushedAt)) continue
    for (const [key, module] of Object.entries(plan.moduleData || {})) {
      if (!module || module.enabled === false) continue
      if (key === 'nutrition_assessment') {
        for (const target of module.advisorTargets || []) {
          if (typeof target?.metric === 'string') names.add(target.metric.trim())
        }
        for (const name of module.nutritionComparisonMetrics || []) {
          if (typeof name === 'string') names.add(name.trim())
        }
      }
      const records = Array.isArray(module) ? module : Array.isArray(module.records) ? module.records : [module]
      for (const row of records) {
        if (key === 'monitoring' && typeof row?.items === 'string') {
          for (const name of row.items.split(/[、，,；;\n]/)) names.add(name.trim())
        }
        for (const name of Array.isArray(row?.reviewItems) ? row.reviewItems : []) {
          if (typeof name === 'string') names.add(name.trim())
        }
      }
    }
  }
  names.delete('')
  for (const name of Object.values(dailyMetricGroups).flat()) names.delete(name)
  return [...names]
}
