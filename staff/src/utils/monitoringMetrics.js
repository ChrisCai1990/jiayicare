// Keep labels aligned with the client health record categories.
export const MONITORING_METRICS = [
  ['bloodPressure', '血压'], ['bloodSugar', '血糖'], ['waist', '腰围'],
  ['heartRate', '心率'], ['weight', '体重'], ['sleep', '睡眠'],
  ['mood', '情绪'], ['diet', '饮食'], ['exercise', '运动'],
  ['water', '饮水'], ['bowel', '排便'], ['smoking', '吸烟'], ['alcohol', '饮酒'],
]

export const MONITORING_PERIODS = {
  bloodPressure: ['晨起', '睡前', '其他时段'],
  bloodSugar: ['空腹', '早餐后2小时', '午餐后2小时', '晚餐后2小时', '睡前', '其他时段'],
  weight: ['晨起', '其他时段'],
}
