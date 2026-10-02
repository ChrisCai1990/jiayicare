// 2023 National Academies Dietary Reference Intakes for Energy, adult EER table S-3.
// https://www.ncbi.nlm.nih.gov/books/NBK591034/
// EER estimates maintenance intake, not an individual's measured expenditure.
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

function estimateMaintenanceEnergy({ gender, age, height, weight, activityLevel }) {
  const coefficients = EER[gender]?.[activityLevel];
  const a = Number(age), h = Number(height), w = Number(weight);
  if (!coefficients || !Number.isFinite(a) || a < 19 || a > 120
    || !Number.isFinite(h) || h < 80 || h > 230
    || !Number.isFinite(w) || w < 25 || w > 350) return null;
  const [intercept, ageFactor, heightFactor, weightFactor] = coefficients;
  return Math.round((intercept + ageFactor * a + heightFactor * h + weightFactor * w) / 10) * 10;
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
  const maintenanceKcal = estimateMaintenanceEnergy({
    gender: patient.gender, age: patient.age, height: assessment.height,
    weight: assessment.weight, activityLevel: assessment.activityLevel,
  });
  if (!assessment.activityLevel || !EER[patient.gender]?.[assessment.activityLevel]) errors.push('已核实活动等级');
  if (!maintenanceKcal) errors.push('可计算维持能量的成年年龄、性别、身高和体重');
  if (patient.gender === '女' && assessment.lifeStage !== 'not_pregnant_lactating') errors.push('请核实非妊娠、非哺乳状态；孕哺期需专门营养评估');
  if (!['maintain', 'reduce', 'increase'].includes(assessment.managementPurpose)) errors.push('管理期能量目标方向');
  const managementKcal = Number(assessment.managementKcal);
  const minimum = patient.gender === '男' ? 1500 : 1200;
  // The NHLBI adult weight-management ranges start at 1200 kcal/d for women
  // and 1500 kcal/d for men; lower intake requires specialist review.
  // https://www.nhlbi.nih.gov/sites/default/files/media/docs/obesity-evidence-review.pdf
  if (!Number.isInteger(managementKcal) || managementKcal < minimum || managementKcal > 6000) errors.push(`管理期能量须为 ${minimum}–6000 kcal/日的整数；更低能量需专门评估`);
  if (maintenanceKcal && Number.isInteger(managementKcal)) {
    if (managementKcal < maintenanceKcal * 0.7 || managementKcal > maintenanceKcal * 1.3) errors.push('管理期能量偏离维持估算超过30%，请走专门评估');
    if (assessment.managementPurpose === 'reduce' && managementKcal >= maintenanceKcal) errors.push('减重方向的管理期能量需低于维持估算');
    if (assessment.managementPurpose === 'increase' && managementKcal <= maintenanceKcal) errors.push('增重方向的管理期能量需高于维持估算');
    const bmi = Number(assessment.weight) / (Number(assessment.height) / 100) ** 2;
    if (assessment.managementPurpose === 'reduce' && bmi < 18.5) errors.push('体重偏低时不能走标准减能量路径');
  }
  const mealKcal = mealEnergyBudgets(managementKcal, assessment.breakfastPercent, assessment.lunchPercent, assessment.dinnerPercent, assessment.snackPercent ?? 0);
  if (!mealKcal) errors.push('早餐、午餐、晚餐及可选加餐的能量比例须为非负整数且合计100%');
  return { errors, maintenanceKcal, managementKcal, mealKcal };
}

module.exports = { estimateMaintenanceEnergy, mealEnergyBudgets, validateNutritionEnergy };
