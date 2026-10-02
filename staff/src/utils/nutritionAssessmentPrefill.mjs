import foodAllergy from '../../../shared/foodAllergy.cjs'
const { isUsableFoodAllergy, foodAllergyEvidence, questionnaireFoodAllergyEvidence } = foodAllergy

const text = value => String(value ?? '').trim()
const row = (label, value) => text(value) ? `${label}：${text(value)}` : ''

function dietFromArchive(patient = {}) {
  const lifestyle = patient.lifestyle_data || {}
  const meals = [
    ['早餐', 'breakfastTime', 'breakfastDetail', 'breakfastDesc'],
    ['午餐', 'lunchTime', 'lunchDetail', 'lunchDesc'],
    ['晚餐', 'dinnerTime', 'dinnerDetail', 'dinnerDesc'],
  ].map(([label, time, place, food]) => {
    const details = [lifestyle[time], lifestyle[place], lifestyle[food]].map(text).filter(Boolean)
    return details.length ? `${label}：${details.join('、')}` : ''
  }).filter(Boolean)
  const summary = [row('档案饮食摘要', lifestyle.diet || patient.lifestyle?.diet), ...meals,
    row('每日膳食评估', lifestyle.dailyDietAssessment), row('每日主食', lifestyle.dailyStaple),
    row('每日蔬菜', lifestyle.dailyVegetables), row('每日荤菜', lifestyle.dailyMeat),
    row('每日饮水', lifestyle.dailyWater)].filter(Boolean)
  return summary.join('；').slice(0, 1200)
}

function medicalFromArchive(patient = {}) {
  const profile = patient.healthProfile || {}
  const summary = [row('档案慢病标签', (patient.chronicDiseases || []).join('、')),
    row('档案既往病史', profile.pastHistory), row('档案近期用药', profile.recentMedication),
    row('档案营养补充', profile.recentSupplement)].filter(Boolean)
  return summary.length ? `档案记录：${summary.join('；')}；相关检查需本次核对` : ''
}

function constraintsFromArchive(patient = {}) {
  const lifestyle = patient.lifestyle_data || {}
  const summary = [row('客户偏好', patient.preferences), row('档案忌口', lifestyle.dietaryRestrictionsDesc),
    row('早餐就餐方式', lifestyle.breakfastDetail), row('午餐就餐方式', lifestyle.lunchDetail),
    row('晚餐就餐方式', lifestyle.dinnerDetail)].filter(Boolean)
  return summary.length ? `档案记录：${summary.join('；')}；时间、做饭条件和预算需本次核对` : ''
}

function priorTargets(previous = {}) {
  const raw = Array.isArray(previous.nutritionTargets) && previous.nutritionTargets.length
    ? previous.nutritionTargets : previous.metric || previous.baseline || previous.target
      ? [{ metric: previous.metric, baseline: previous.baseline, target: previous.target }] : []
  return raw.map(item => ({ metric: text(item.metric), baseline: text(item.baseline), target: text(item.target) }))
}

export function nutritionAssessmentPrefill(patient = {}, previous = null) {
  const prior = previous || {}
  const recordedAllergy = foodAllergyEvidence(patient) || questionnaireFoodAllergyEvidence(patient)
  return {
    goal: text(prior.goal),
    assessment: {
      height: patient.height || prior.height || '', weight: patient.weight || prior.weight || '',
      currentDiet: text(prior.currentDiet) || dietFromArchive(patient),
      nutritionTargets: priorTargets(prior).length ? priorTargets(prior) : [{ metric: '', baseline: '', target: '' }],
      reviewDate: '', medicalReview: text(prior.medicalReview) || medicalFromArchive(patient),
      practicalConstraints: text(prior.practicalConstraints) || constraintsFromArchive(patient),
      allergyStatus: '', allergyDetails: recordedAllergy || (isUsableFoodAllergy(prior.allergyDetails) ? text(prior.allergyDetails) : ''),
      riskStatus: '', templateCompatibilityConfirmed: false,
    },
  }
}
