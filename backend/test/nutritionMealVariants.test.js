const test = require('node:test');
const assert = require('node:assert/strict');
const { PACK, PACK_LINE, packBudgets, switchMealPlan, mealPlanError } = require('../../shared/nutritionMealPlans.cjs');
const { variantPrompt, parseVariants } = require('../src/utils/nutritionMealVariants');
const { nutritionPlanItems } = require('../src/utils/nutritionPlanItems');
const assessment = { managementKcal: 1700, mealEnergyKcal: { breakfast: 510, lunch: 680, dinner: 510, snack: 0 } };
const meals = { breakfast: '主食50 g（生重）', lunch: '蔬菜200 g（可食部）', dinner: '荤菜100 g（可食部）', snack: '' };
const raw = () => ({ balanced_recipes: { ...meals, breakfast: '燕麦50 g（干重）' }, balanced_categories: { ...meals }, meal_pack: { ...meals } });

test('每包营养成分按50g保存，早餐晚餐扣200且每日总预算不变', () => {
  assert.equal(PACK.proteinG, 13.2);
  assert.equal(PACK.calciumMg, 260);
  assert.equal(PACK.labelEnergyKj, 855.5);
  const remaining = packBudgets(assessment.mealEnergyKcal);
  assert.deepEqual(remaining, { breakfast: 310, lunch: 680, dinner: 310, snack: 0 });
  assert.equal(Object.values(remaining).reduce((a, b) => a + b) + 400, 1700);
  assert.equal(packBudgets({ ...assessment.mealEnergyKcal, breakfast: 199 }), null);
  assert.equal(packBudgets({ ...assessment.mealEnergyKcal, dinner: 199 }), null);
  assert.equal(packBudgets({ ...assessment.mealEnergyKcal, breakfast: 200 }).breakfast, 0);
});

test('三种草稿严格完整，餐包固定加入早晚且0加餐不生成', () => {
  const { variants } = parseVariants(raw(), assessment);
  assert.equal(Object.keys(variants).length, 3);
  assert(variants.meal_pack.breakfast.content.startsWith(PACK_LINE));
  assert(variants.meal_pack.dinner.content.startsWith(PACK_LINE));
  assert(!variants.meal_pack.lunch.content.includes(PACK_LINE));
  assert.equal(variants.meal_pack.snack.content, '');
  assert.equal(variants.meal_pack.snack.enabled, false);
  assert.throws(() => parseVariants({ ...raw(), balanced_recipes: {} }, assessment));
  assert.throws(() => parseVariants({ ...raw(), meal_pack: { ...meals, dinner: '营养餐包1包' } }, assessment));
  assert.throws(() => parseVariants(raw(), { ...assessment, mealEnergyKcal: { ...assessment.mealEnergyKcal, snack: 100 } }));
  const exact = parseVariants({ ...raw(), meal_pack: { ...meals, breakfast: '' } }, { ...assessment, mealEnergyKcal: { ...assessment.mealEnergyKcal, breakfast: 200 } });
  assert.equal(exact.variants.meal_pack.breakfast.content, PACK_LINE);
});

test('不足预算或餐包禁忌保留平衡膳食方案并给出不可用原因', () => {
  const insufficient = parseVariants(raw(), { ...assessment, mealEnergyKcal: { ...assessment.mealEnergyKcal, breakfast: 199 } });
  assert.equal(insufficient.variants.meal_pack, undefined);
  assert(insufficient.unavailableReason.includes('200'));
  const contraindication = parseVariants({ ...raw(), meal_pack: null, mealPackUnavailableReason: '需核实疾病适用性' }, assessment);
  assert.equal(contraindication.unavailableReason, '需核实疾病适用性');
});

test('切换保留各自编辑、时间和启用状态，客户items只来自选中版本', () => {
  const { variants } = parseVariants(raw(), assessment);
  const modules = { ...variants.balanced_categories, breakfast: { content: '人工主食60 g', time: '08:00', enabled: true }, principle: { dietPrinciple: '保留原则' } };
  const switched = switchMealPlan(variants, 'balanced_categories', 'meal_pack', modules);
  const restored = switchMealPlan(switched.variants, 'meal_pack', 'balanced_categories', switched.modules);
  assert.deepEqual(restored.modules.breakfast, modules.breakfast);
  assert.deepEqual(switched.modules.principle, modules.principle);
  const items = nutritionPlanItems({ content: { moduleData: switched.modules }, items: [] });
  assert.equal(items.filter(item => item.notes.includes(PACK_LINE)).length, 2);
  assert(!items.some(item => item.notes.includes('人工主食60')));
});

test('保存及推送餐包方案需要适用性核实并保持早晚固定餐包', () => {
  const { variants } = parseVariants(raw(), assessment);
  const content = { mealPlanSelection: 'meal_pack', nutritionAssessment: assessment, moduleData: variants.meal_pack };
  assert(mealPlanError(content).includes('配料'));
  content.mealPackSuitabilityConfirmed = true;
  assert.equal(mealPlanError(content), null);
  assert(mealPlanError({ ...content, moduleData: { ...content.moduleData, dinner: { content: '普通食物' } } }).includes('各一包'));
  assert.equal(mealPlanError({}), null);
  assert(mealPlanError({ mealPlanSelection: 'bad' }));
});

test('AI提示包含三种模式、餐盘依据、常规食物剩余预算和成分数据', () => {
  const prompt = variantPrompt(assessment);
  assert(prompt.includes('balanced_recipes') && prompt.includes('balanced_categories') && prompt.includes('meal_pack'));
  assert(prompt.includes('早餐310') && prompt.includes('晚餐310'));
  assert(prompt.includes('不能等同热量或重量比例'));
  assert(prompt.includes('proteinG'));
});
