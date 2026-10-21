const test = require('node:test');
const assert = require('node:assert/strict');
const { idealWeight, estimateDailyEnergy, mealEnergyBudgets, validateNutritionEnergy } = require('../../shared/nutritionEnergy.cjs');
const { withFixedNutritionTargets } = require('../../shared/nutritionTargets.cjs');

test('理想体重与四档活动系数计算全日参考能量', () => {
  assert.equal(idealWeight(165), 60);
  assert.equal(estimateDailyEnergy({ height: 165, activityLevel: 'inactive' }), 900);
  assert.equal(estimateDailyEnergy({ height: 165, activityLevel: 'low_active' }), 1350);
  assert.equal(estimateDailyEnergy({ height: 165, activityLevel: 'low_active', activityCoefficient: 20 }), 1200);
  assert.equal(estimateDailyEnergy({ height: 165, activityLevel: 'low_active', activityCoefficient: 25 }), 1500);
  assert.equal(estimateDailyEnergy({ height: 165, activityLevel: 'active' }), 1800);
  assert.equal(estimateDailyEnergy({ height: 165, activityLevel: 'very_active' }), 2100);
  assert.equal(estimateDailyEnergy({ height: 165, activityLevel: 'low_active', activityCoefficient: 26 }), null);
});

test('餐次预算合计等于管理期能量，含可选加餐', () => {
  assert.deepEqual(mealEnergyBudgets(1600, 30, 40, 20, 10), { breakfast: 480, lunch: 640, dinner: 320, snack: 160 });
  assert.equal(mealEnergyBudgets(1600, 30, 40, 20, 0), null);
  const patient = { gender: '女', age: 42 };
  const input = { height: 165, weight: 68, activityLevel: 'active', lifeStage: 'not_pregnant_lactating', managementPurpose: 'maintain', managementKcal: 1800, breakfastPercent: 30, lunchPercent: 40, dinnerPercent: 30 };
  assert.deepEqual(validateNutritionEnergy(patient, input).errors, []);
  assert(validateNutritionEnergy(patient, { ...input, lifeStage: 'pregnant_or_lactating' }).errors.some(x => x.includes('孕哺期')));
});

test('管理期目标偏离理想体重参考值超过30%时提示复核但允许生成', () => {
  const patient = { gender: '女', age: 42 };
  const input = { height: 165, weight: 130, activityLevel: 'inactive', lifeStage: 'not_pregnant_lactating',
    managementPurpose: 'reduce', managementKcal: 1600, breakfastPercent: 30, lunchPercent: 40, dinnerPercent: 30 };
  const result = validateNutritionEnergy(patient, input);
  assert.equal(result.estimatedDailyKcal, 900);
  assert.deepEqual(result.errors, []);
  assert(result.warnings.some(warning => warning.includes('理想体重')));
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
