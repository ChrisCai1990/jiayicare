const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateMaintenanceEnergy, bodyMassIndex, idealWeight, estimateDailyEnergy, mealEnergyBudgets, validateNutritionEnergy, updateEnergyAssessment } = require('../../shared/nutritionEnergy.cjs');
const { withFixedNutritionTargets } = require('../../shared/nutritionTargets.cjs');

test('算法1仍按年龄、性别、当前体重和日常活动等级计算维持参考值', () => {
  assert.equal(estimateMaintenanceEnergy({ gender: '女', age: 42, height: 165, weight: 68, activityLevel: 'inactive' }), 2030);
  assert.equal(estimateMaintenanceEnergy({ gender: '男', age: 42, height: 165, weight: 68, activityLevel: 'inactive' }), 2330);
  assert.equal(estimateMaintenanceEnergy({ gender: '未知', age: 42, height: 165, weight: 68, activityLevel: 'inactive' }), null);
});

test('算法2仅为超重肥胖会员按理想体重和独立体力活动系数计算', () => {
  assert.equal(idealWeight(165), 60);
  assert(bodyMassIndex(165, 65.34) >= 24);
  assert(bodyMassIndex(165, 65) < 24);
  assert.equal(estimateDailyEnergy({ height: 165, weightActivityLevel: 'bedrest' }), 900);
  assert.equal(estimateDailyEnergy({ height: 165, weightActivityLevel: 'light' }), 1350);
  assert.equal(estimateDailyEnergy({ height: 165, weightActivityLevel: 'light', activityCoefficient: 20 }), 1350);
  assert.equal(estimateDailyEnergy({ height: 165, weightActivityLevel: 'light', activityCoefficient: 25 }), 1350);
  assert.equal(estimateDailyEnergy({ height: 165, weightActivityLevel: 'moderate' }), 1800);
  assert.equal(estimateDailyEnergy({ height: 165, weightActivityLevel: 'heavy' }), 2100);
  assert.equal(estimateDailyEnergy({ height: 165, weightActivityLevel: 'unknown' }), null);
});

test('餐次预算合计等于管理期能量，含可选加餐', () => {
  assert.deepEqual(mealEnergyBudgets(1600, 30, 40, 20, 10), { breakfast: 480, lunch: 640, dinner: 320, snack: 160 });
  assert.equal(mealEnergyBudgets(1600, 30, 40, 20, 0), null);
  const patient = { gender: '女', age: 42 };
  const input = { height: 165, weight: 60, activityLevel: 'active', lifeStage: 'not_pregnant_lactating', managementPurpose: 'maintain', managementKcal: 2240, breakfastPercent: 30, lunchPercent: 40, dinnerPercent: 30 };
  const normal = validateNutritionEnergy(patient, input);
  assert.deepEqual(normal.errors, []);
  assert.equal(normal.overweight, false);
  assert.equal(normal.automaticKcal, null);
  assert.equal(normal.estimatedDailyKcal, null);
  assert(validateNutritionEnergy(patient, { ...input, lifeStage: 'pregnant_or_lactating' }).errors.some(x => x.includes('孕哺期')));
});

test('算法1只显示参考值，算法2在超重肥胖时自动填入且保留人工调整', () => {
  const patient = { gender: '女', age: 42 };
  const normal = { height: 165, weight: 60, activityLevel: '', managementKcal: '' };
  const withRoutine = updateEnergyAssessment(patient, normal, 'activityLevel', 'inactive');
  assert.equal(withRoutine.managementKcal, '');
  assert.equal(validateNutritionEnergy(patient, withRoutine).maintenanceKcal, estimateMaintenanceEnergy({ ...patient, ...withRoutine }));
  const overweight = updateEnergyAssessment(patient, withRoutine, 'weight', 68);
  assert.equal(overweight.managementKcal, '');
  const withWeightActivity = updateEnergyAssessment(patient, overweight, 'weightActivityLevel', 'light');
  assert.equal(withWeightActivity.managementKcal, 1350);
  assert.equal(updateEnergyAssessment(patient, { ...withWeightActivity, managementKcal: 1600 }, 'activityCoefficient', 25).managementKcal, 1600);
  assert.equal(updateEnergyAssessment(patient, withWeightActivity, 'height', 168).managementKcal, 1418);
  assert.equal(updateEnergyAssessment(patient, withWeightActivity, 'height', 170).managementKcal, '');
  assert.deepEqual(validateNutritionEnergy(patient, { ...withWeightActivity, managementKcal: '' }).warnings, []);
});

test('轻体力活动显示上下限并取中间值，人工管理能量决定餐次预算', () => {
  const patient = { gender: '男', age: 42 };
  const input = { height: 190, weight: 110, activityLevel: 'active', managementPurpose: 'reduce', managementKcal: '', breakfastPercent: 30, lunchPercent: 40, dinnerPercent: 30 };
  const automatic = updateEnergyAssessment(patient, input, 'weightActivityLevel', 'light');
  assert.equal(automatic.managementKcal, 1913);
  const result = validateNutritionEnergy(patient, { ...automatic, activityCoefficient: '', managementKcal: 1700 });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.dailyEnergyRange, { min: 1700, max: 2125 });
  assert.equal(result.activityCoefficient, 22.5);
  assert.equal(result.estimatedDailyKcal, 1913);
  assert.deepEqual(result.mealKcal, { breakfast: 510, lunch: 680, dinner: 510, snack: 0 });
  assert.equal(updateEnergyAssessment(patient, { ...automatic, managementKcal: 1700 }, 'height', 191).managementKcal, 1700);
  assert.equal(validateNutritionEnergy(patient, { ...automatic, weightActivityLevel: 'moderate' }).dailyEnergyRange, null);
});

test('管理期目标偏离理想体重参考值超过30%时提示复核但允许生成', () => {
  const patient = { gender: '女', age: 42 };
  const input = { height: 165, weight: 130, activityLevel: 'inactive', weightActivityLevel: 'bedrest', lifeStage: 'not_pregnant_lactating',
    managementPurpose: 'reduce', managementKcal: 1600, breakfastPercent: 30, lunchPercent: 40, dinnerPercent: 30 };
  const result = validateNutritionEnergy(patient, input);
  assert.equal(result.estimatedDailyKcal, 900);
  assert.equal(result.automaticKcal, 900);
  assert.deepEqual(result.errors, []);
  assert(result.warnings.some(warning => warning.includes('当前体重')));
  assert(validateNutritionEnergy(patient, { ...input, weightActivityLevel: '' }).errors.some(error => error.includes('体力活动强度')));
  assert(validateNutritionEnergy(patient, { ...input, managementKcal: 1100 }).errors.some(error => error.includes('管理期能量须为')));
});

test('固定三项体成分与可选体重保留个性化目标，只从带日期的测量记录带入固定基线', () => {
  const patient = { bodyComposition: { measuredAt: '2026-10-01', weight: 68, skelMuscle: 24, bodyFatRate: 32, visceralFat: 9 } };
  const rows = withFixedNutritionTargets([{ metric: '体重', baseline: '', target: '67 kg' }, { metric: '腰围', baseline: '88 cm', target: '84 cm' }], patient);
  assert.deepEqual(rows.map(row => row.metric), ['骨骼肌', '体脂率', '内脏脂肪', '体重', '腰围']);
  assert.equal(rows[3].baseline, '');
  assert.equal(rows[3].target, '67 kg');
  assert.equal(rows[1].baseline, '32 %（2026-10-01）');
  assert.equal(withFixedNutritionTargets([], { bodyComposition: { weight: 68 } })[0].baseline, '');
});
