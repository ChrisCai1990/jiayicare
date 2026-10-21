// 2023 National Academies Dietary Reference Intakes for Energy, adult EER table S-3.
// https://www.ncbi.nlm.nih.gov/books/NBK591034/
const EER = {
  男: {
    inactive: [753.07, -10.83, 6.50, 14.10],
    low_active: [581.47, -10.83, 8.30, 14.94],
    active: [1004.82, -10.83, 6.52, 15.91],
    very_active: [-517.88, -10.83, 15.61, 19.11],
  },
  女: {
    inactive: [584.90, -7.01, 5.72, 11.71],
    low_active: [575.77, -7.01, 6.60, 12.14],
    active: [710.25, -7.01, 6.54, 12.34],
    very_active: [511.83, -7.01, 9.07, 12.56],
  },
};

// Adult overweight guidance: BMI >= 24; kg of ideal weight = cm of height - 105.
const WEIGHT_ACTIVITY_FACTORS = { bedrest: 15, light: 22.5, moderate: 30, heavy: 35 };

function estimateMaintenanceEnergy({ gender, age, height, weight, activityLevel }) {
  const coefficients = EER[gender]?.[activityLevel];
  const a = Number(age), h = Number(height), w = Number(weight);
  if (!coefficients || !Number.isFinite(a) || a < 19 || a > 120
    || !Number.isFinite(h) || h < 80 || h > 230
    || !Number.isFinite(w) || w < 25 || w > 350) return null;
  const [intercept, ageFactor, heightFactor, weightFactor] = coefficients;
  return Math.round((intercept + ageFactor * a + heightFactor * h + weightFactor * w) / 10) * 10;
}

function bodyMassIndex(height, weight) {
  const h = Number(height), w = Number(weight);
  return Number.isFinite(h) && h > 0 && Number.isFinite(w) && w > 0 ? w / (h / 100) ** 2 : null;
}

function idealWeight(height) {
  const h = Number(height);
  return Number.isFinite(h) && h > 105 && h <= 230 ? h - 105 : null;
}

function activityFactor(level, selected) {
  if (!Object.prototype.hasOwnProperty.call(WEIGHT_ACTIVITY_FACTORS, level)) return null;
  if (level !== 'light') return WEIGHT_ACTIVITY_FACTORS[level];
  if (selected === '' || selected === null || selected === undefined) return 22.5;
  const factor = Number(selected);
  return Number.isFinite(factor) && factor >= 20 && factor <= 25 ? factor : null;
}

function estimateDailyEnergy({ height, weightActivityLevel, activityCoefficient }) {
  const weight = idealWeight(height);
  const factor = activityFactor(weightActivityLevel, activityCoefficient);
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
  const maintenanceKcal = estimateMaintenanceEnergy({
    gender: patient.gender, age: patient.age, height: assessment.height,
    weight: assessment.weight, activityLevel: assessment.activityLevel,
  });
  const bmi = bodyMassIndex(assessment.height, assessment.weight);
  const overweight = bmi !== null && bmi >= 24;
  const calculatedIdealWeight = overweight ? idealWeight(assessment.height) : null;
  const coefficient = overweight ? activityFactor(assessment.weightActivityLevel, assessment.activityCoefficient) : null;
  const estimatedDailyKcal = overweight ? estimateDailyEnergy(assessment) : null;
  const automaticKcal = overweight ? estimatedDailyKcal : null;
  if (!assessment.activityLevel || !EER[patient.gender]?.[assessment.activityLevel]) errors.push('已核实日常活动等级');
  if (!maintenanceKcal) errors.push('可计算当前体重维持能量的成年年龄、性别、身高和体重');
  if (overweight && coefficient === null) errors.push('已核实超重肥胖体力活动强度及有效能量系数');
  if (overweight && calculatedIdealWeight === null) errors.push('可计算理想体重的身高');
  if (patient.gender === '女' && assessment.lifeStage !== 'not_pregnant_lactating') errors.push('请核实非妊娠、非哺乳状态；孕哺期需专门营养评估');
  if (!['maintain', 'reduce', 'increase'].includes(assessment.managementPurpose)) errors.push('管理期能量目标方向');
  const managementKcal = assessment.managementKcal === '' || assessment.managementKcal === null || assessment.managementKcal === undefined
    ? null : Number(assessment.managementKcal);
  const minimum = patient.gender === '男' ? 1500 : 1200;
  if (!Number.isInteger(managementKcal) || managementKcal < minimum || managementKcal > 6000) errors.push(`管理期能量须为 ${minimum}–6000 kcal/日的整数；更低能量需专门评估`);
  if (maintenanceKcal && Number.isInteger(managementKcal) && managementKcal > 0) {
    if (managementKcal < maintenanceKcal * 0.7 || managementKcal > maintenanceKcal * 1.3) warnings.push('管理期能量与当前体重维持估算相差超过30%，请结合阶段目标、减重速度和健康风险核对；此估算不是目标体重的维持能量');
    if (assessment.managementPurpose === 'reduce' && managementKcal >= maintenanceKcal) errors.push('减重方向的管理期能量需低于当前体重维持估算');
    if (assessment.managementPurpose === 'increase' && managementKcal <= maintenanceKcal) errors.push('增重方向的管理期能量需高于当前体重维持估算');
    if (assessment.managementPurpose === 'reduce' && bmi < 18.5) errors.push('体重偏低时不能走标准减能量路径');
  }
  const mealKcal = mealEnergyBudgets(managementKcal, assessment.breakfastPercent, assessment.lunchPercent, assessment.dinnerPercent, assessment.snackPercent ?? 0);
  if (!mealKcal) errors.push('早餐、午餐、晚餐及可选加餐的能量比例须为非负整数且合计100%');
  return { errors, warnings, bmi, overweight, maintenanceKcal, idealWeight: calculatedIdealWeight, activityCoefficient: coefficient, estimatedDailyKcal, automaticKcal, managementKcal, mealKcal };
}

function updateEnergyAssessment(patient, current, key, fieldValue) {
  const next = { ...current, [key]: fieldValue };
  if (key === 'weightActivityLevel') next.activityCoefficient = fieldValue === 'light' ? 22.5 : '';
  if (['height', 'weight', 'activityLevel', 'weightActivityLevel', 'activityCoefficient'].includes(key)) {
    const oldEstimate = validateNutritionEnergy(patient, current).automaticKcal;
    const newEstimate = validateNutritionEnergy(patient, next).automaticKcal;
    if (!current.managementKcal || Number(current.managementKcal) === oldEstimate) next.managementKcal = newEstimate || '';
  }
  return next;
}

module.exports = { estimateMaintenanceEnergy, bodyMassIndex, idealWeight, activityFactor, estimateDailyEnergy, mealEnergyBudgets, validateNutritionEnergy, updateEnergyAssessment };
