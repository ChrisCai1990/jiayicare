const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateMaintenanceEnergy, mealEnergyBudgets, validateNutritionEnergy } = require('../../shared/nutritionEnergy.cjs');
const { withFixedNutritionTargets } = require('../../shared/nutritionTargets.cjs');

test('2023 成人维持能量估算使用年龄、性别、身高体重和活动等级', () => {
  assert.equal(estimateMaintenanceEnergy({ gender: '女', age: 42, height: 165, weight: 68, activityLevel: 'inactive' }), 2030);
  assert.equal(estimateMaintenanceEnergy({ gender: '男', age: 42, height: 165, weight: 68, activityLevel: 'inactive' }), 2330);
  assert.equal(estimateMaintenanceEnergy({ gender: '未知', age: 42, height: 165, weight: 68, activityLevel: 'inactive' }), null);
});

test('餐次预算合计等于管理期能量，含可选加餐', () => {
  assert.deepEqual(mealEnergyBudgets(1600, 30, 40, 20, 10), { breakfast: 480, lunch: 640, dinner: 320, snack: 160 });
  assert.equal(mealEnergyBudgets(1600, 30, 40, 20, 0), null);
  const patient = { gender: '女', age: 42 };
  const input = { height: 165, weight: 68, activityLevel: 'inactive', lifeStage: 'not_pregnant_lactating', managementPurpose: 'maintain', managementKcal: 2030, breakfastPercent: 30, lunchPercent: 40, dinnerPercent: 30 };
  assert.deepEqual(validateNutritionEnergy(patient, input).errors, []);
  assert(validateNutritionEnergy(patient, { ...input, lifeStage: 'pregnant_or_lactating' }).errors.some(x => x.includes('孕哺期')));
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
