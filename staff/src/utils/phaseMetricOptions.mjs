export const dailyMetricGroups = {
  '日常指标': ['血压', '体重'],
  '血糖': ['空腹血糖', '餐后血糖'],
  '排便': ['排便形态', '排便次数'],
  '睡眠': ['入睡时间', '夜间醒来情况', '晨醒时间', '睡眠时长', '睡眠质量'],
  '精力': ['日间精力'],
  '饮食习惯': ['膳食结构','每餐食量','进食速度'],
  '运动习惯': ['运动频率','运动方式','每次运动时长'],
  '烟酒习惯': ['每日吸烟量','饮酒频率','每次饮酒量'],
}

export const metricUnits = {血压:'mmHg',体重:'kg',空腹血糖:'mmol/L',餐后血糖:'mmol/L',排便次数:'次/日',睡眠时长:'小时',每餐食量:'份/餐',进食速度:'分钟/餐',运动频率:'天/周',每次运动时长:'分钟',每日吸烟量:'支/日',饮酒频率:'天/周',每次饮酒量:'mL（注明酒种）'}
export function metricReference(metric,plans) {
  for (const plan of plans) {
    if (!plan.pushedAt || plan.returnedAt && new Date(plan.returnedAt)>=new Date(plan.pushedAt)) continue
    const module = plan.moduleData?.nutrition_assessment
    const target = module?.enabled!==false && module?.advisorTargets?.find(r=>r.metric===metric && r.referenceRange)
    if (target) return '年度方案参考范围：'+target.referenceRange
  }
  if (metric==='血压') return '成人家庭血压参考：连续规范测量 5–7 天，平均收缩压 ≥135 或舒张压 ≥85 mmHg 为高血压筛查界值（国家卫健委）。'
  return ''
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
