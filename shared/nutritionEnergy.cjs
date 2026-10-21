const ACTIVITY_FACTORS = { inactive: 15, low_active: 22.5, active: 30, very_active: 35 };

function idealWeight(height) {
  const h = Number(height);
  return Number.isFinite(h) && h > 105 && h <= 230 ? h - 105 : null;
}

function activityFactor(level, selected) {
  if (!Object.prototype.hasOwnProperty.call(ACTIVITY_FACTORS, level)) return null;
  if (level !== 'low_active') return ACTIVITY_FACTORS[level];
  if (selected === '' || selected === null || selected === undefined) return 22.5;
  const factor = Number(selected);
  return Number.isFinite(factor) && factor >= 20 && factor <= 25 ? factor : null;
}

function estimateDailyEnergy({ height, activityLevel, activityCoefficient }) {
  const weight = idealWeight(height);
  const factor = activityFactor(activityLevel, activityCoefficient);
  return weight !== null && factor !== null ? Math.round(weight * factor) : null;
}

function mealEnergyBudgets(total, breakfast, lunch, dinner, snack = 0) {
  const kcal = Number(total);
  const shares = [Number(breakfast), Number(lunch), Number(dinner), Number(snack)];
  if (!Number.isInteger(kcal) || kcal < 1 || shares.some(share => !Number.isInteger(share) || share < 0)
    || shares.reduce((sum, share) => sum + share, 0) !== 100) return null;
  const morning = Math.round(kcal * shares[0] / 100);
  const midday = Math.round(kcal * shares[1] / 100);
  const between = Math.round(kcal * shares[3] / 100);
  return { breakfast: morning, lunch: midday, dinner: kcal - morning - midday - between, snack: between };
}

function validateNutritionEnergy(patient = {}, assessment = {}) {
  const errors = [];
  const warnings = [];
  const calculatedIdealWeight = idealWeight(assessment.height);
  const coefficient = activityFactor(assessment.activityLevel, assessment.activityCoefficient);
  const estimatedDailyKcal = estimateDailyEnergy(assessment);
  if (coefficient === null) errors.push('已核实活动等级及有效能量系数');
  if (calculatedIdealWeight === null) errors.push('可计算理想体重的身高');
  if (patient.gender === '女' && assessment.lifeStage !== 'not_pregnant_lactating') errors.push('请核实非妊娠、非哺乳状态；孕哺期需专门营养评估');
  if (!['maintain', 'reduce', 'increase'].includes(assessment.managementPurpose)) errors.push('管理期能量目标方向');
  const managementKcal = Number(assessment.managementKcal);
  const minimum = patient.gender === '男' ? 1500 : 1200;
  if (!Number.isInteger(managementKcal) || managementKcal < minimum || managementKcal > 6000) errors.push(`管理期能量须为 ${minimum}–6000 kcal/日的整数；更低能量需专门评估`);
  if (estimatedDailyKcal && Number.isInteger(managementKcal)) {
    if (managementKcal < estimatedDailyKcal * 0.7 || managementKcal > estimatedDailyKcal * 1.3) warnings.push('管理期能量与理想体重计算值相差超过30%，请结合阶段目标及健康风险核对');
    const bmi = Number(assessment.weight) / (Number(assessment.height) / 100) ** 2;
    if (assessment.managementPurpose === 'reduce' && bmi < 18.5) errors.push('体重偏低时不能走标准减能量路径');
  }
  const mealKcal = mealEnergyBudgets(managementKcal, assessment.breakfastPercent, assessment.lunchPercent, assessment.dinnerPercent, assessment.snackPercent ?? 0);
  if (!mealKcal) errors.push('早餐、午餐、晚餐及可选加餐的能量比例须为非负整数且合计100%');
  return { errors, warnings, idealWeight: calculatedIdealWeight, activityCoefficient: coefficient, estimatedDailyKcal, managementKcal, mealKcal };
}

module.exports = { idealWeight, activityFactor, estimateDailyEnergy, mealEnergyBudgets, validateNutritionEnergy };
