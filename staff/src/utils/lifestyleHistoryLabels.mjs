// 历史记录保存的是字段键；展示文案应与生活方式表单保持一致。
export const lifestyleHistoryLabels = {
  diet: '饮食习惯', exercise: '运动习惯', sleep: '睡眠习惯', water: '饮水情况',
  alcohol: '饮酒情况', smoking: '吸烟情况', bowel: '排便情况', mood: '情绪状态',
  breakfastTime: '早餐时间', breakfastDetail: '早餐就餐方式', breakfastDesc: '早餐品类描述',
  morningSnack: '上午加餐', morningSnackDesc: '上午加餐品类',
  lunchTime: '午餐时间', lunchDetail: '午餐就餐方式', lunchDesc: '午餐品类描述',
  afternoonSnack: '下午加餐', afternoonSnackDesc: '下午加餐品类',
  dinnerTime: '晚餐时间', dinnerDetail: '晚餐就餐方式', dinnerDesc: '晚餐品类描述',
  eveningSnack: '晚间加餐', eveningSnackDesc: '晚间加餐品类',
  dailyStaple: '每日主食摄入量', dailyVegetables: '每日蔬菜摄入量', dailyMeat: '每日荤菜摄入量',
  fruitFrequency: '吃水果频次', fruitAmount: '水果摄入量',
  eggFrequency: '鸡蛋摄入频次', eggAmount: '鸡蛋摄入量',
  dairyAmount: '奶制品摄入量', dairyRemark: '奶制品备注',
  nutFrequency: '坚果摄入频次', nutAmount: '坚果摄入量',
  grainFrequency: '粗杂粮摄入频次', grainAmount: '粗杂粮摄入量',
  dietaryRestrictions: '忌口', dietaryRestrictionsDesc: '忌口具体说明',
  badDietHabits: '不良饮食习惯', entertainment: '应酬频率',
  exerciseType: '运动类型', exerciseFrequency: '运动频率', exerciseDuration: '每次运动时长（分钟）',
  wakeTime: '起床时间', sleepTime: '入睡时间', scheduleRegularity: '作息规律性', exerciseRemark: '运动备注',
  smokingStatus: '吸烟情况', drinkingFrequency: '饮酒频率', drinkingType: '饮酒类型',
  drinkingTypeOtherDesc: '饮酒类型-其它说明', drinkingAmount: '饮酒量', entertainmentFreq: '应酬频率（烟酒板块）',
  nutritionHistory: '营养干预史', dailyDietAssessment: '每日膳食摄入量评估',
  nutrientOverview: '营养素摄入概况', foodAllergens: '食物过敏源',
  foodAllergensOtherDesc: '食物过敏源-其它说明', glutenAllergy: '麸质过敏',
  dailyWater: '每日饮水量', psychStress: '心理压力', bowelRegularity: '排便规律性', bowelShape: '大便形状',
  autoSummaryFlags: '系统自动摘要', summaryOverride: '人工摘要',
}

export function lifestyleHistoryLabel(key) {
  if (key.startsWith('营养评估 · ')) return key
  return lifestyleHistoryLabels[key] || '其他生活方式信息'
}
