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
  assert.throws(() => parseVariants({ ...raw(), meal_pack: {} }, assessment));
  assert.throws(() => parseVariants(raw(), { ...assessment, mealEnergyKcal: { ...assessment.mealEnergyKcal, snack: 100 } }));
  const exact = parseVariants({ ...raw(), meal_pack: { ...meals, breakfast: '' } }, { ...assessment, mealEnergyKcal: { ...assessment.mealEnergyKcal, breakfast: 200 } });
  assert.equal(exact.variants.meal_pack.breakfast.content, PACK_LINE);
});

test('预算不足仍限制餐包，适用性风险保留提示并开放选择', () => {
  const insufficient = parseVariants(raw(), { ...assessment, mealEnergyKcal: { ...assessment.mealEnergyKcal, breakfast: 199 } });
  assert.equal(insufficient.variants.meal_pack, undefined);
  assert(insufficient.unavailableReason.includes('200'));
  const contraindication = parseVariants({ ...raw(), meal_pack: null, mealPackUnavailableReason: '需核实疾病适用性' }, assessment);
  assert.equal(contraindication.unavailableReason, '需核实疾病适用性');
});

test('切换保留各自编辑、时间和启用状态，客户items只来自选中版本', () => {
  const { variants } = parseVariants(raw(), assessment);
  const modules = { ...variants.balanced_categories, breakfast: { content: '主食 60 g', time: '08:00', enabled: true }, principle: { dietPrinciple: '保留原则' } };
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

test('AI提示包含三种模式、宝塔依据、常规食物剩余预算和成分数据', () => {
  const prompt = variantPrompt(assessment);
  assert(prompt.includes('balanced_recipes') && prompt.includes('balanced_categories') && prompt.includes('meal_pack'));
  assert(prompt.includes('早餐310') && prompt.includes('晚餐310'));
  assert(prompt.includes('不能等同热量或重量比例'));
  assert(prompt.includes('proteinG'));
  assert(prompt.includes('中国居民平衡膳食宝塔（2022）'));
  assert(!prompt.includes('餐盘'));
});

test('大类加餐限制不影响具体食谱，切换保持三个版本各自内容', () => {
  const input = raw();
  input.balanced_recipes.breakfast = '燕麦50g、苹果100g、核桃10g';
  const { variants } = parseVariants(input, assessment);
  assert.equal(variants.balanced_recipes.breakfast.content, input.balanced_recipes.breakfast);
  assert(!/水果|坚果/.test(variants.balanced_categories.breakfast.content));
  assert(variants.meal_pack.breakfast.content.startsWith(PACK_LINE));
  let state = switchMealPlan(variants, 'balanced_recipes', 'meal_pack', variants.balanced_recipes, assessment);
  state = switchMealPlan(state.variants, state.selected, 'balanced_categories', state.modules, assessment);
  state = switchMealPlan(state.variants, state.selected, 'balanced_recipes', state.modules, assessment);
  assert.equal(state.modules.breakfast.content, input.balanced_recipes.breakfast);
  assert(!state.modules.breakfast.content.includes(PACK_LINE));
  const recipePrompt = variantPrompt(assessment).split('\n').find(line => line.startsWith('balanced_recipes：'));
  assert.equal(recipePrompt, 'balanced_recipes：遵循中国居民平衡膳食宝塔（2022），给出具体食谱、食材和克数（奶类可用ml）。');
});

test('餐包按截图1748预算扣400后生成大类，重复打开不叠加餐包并保留人工编辑', () => {
  const { packCategoryMeals } = require('../../shared/nutritionMealPlans.cjs');
  const input = { managementKcal: 1748, mealEnergyKcal: { breakfast: 524, lunch: 699, dinner: 438, snack: 87 } };
  const result = packCategoryMeals({ breakfast: { content: PACK_LINE + '\n仅常规食物', time: '08:00' } }, input);
  assert.deepEqual(['breakfast','lunch','dinner','snack'].map(key => result[key].categoryTargetKcal), [324,699,238,87]);
  assert.equal(Object.values(result).reduce((sum, row) => sum + row.categoryTargetKcal, 0), 1348);
  for (const key of ['breakfast','lunch','dinner','snack']) {
    assert(!result[key].content.includes('仅常规食物'));
    assert(Math.abs(result[key].categoryReferenceKcal - result[key].categoryTargetKcal) <= 10);
    if (key !== 'snack') assert(!/水果|坚果/.test(result[key].content));
  }
  assert.equal(result.breakfast.time, '08:00');
  assert.deepEqual(packCategoryMeals(result, input), result);
  result.lunch.content = '谷薯类 80克\n蔬菜 200克';
  assert.deepEqual(packCategoryMeals(result, input), result);
  assert.equal(Object.values(result).map(row => row.content).join('\n').split(PACK_LINE).length - 1, 2);
  const exact = packCategoryMeals({}, { mealEnergyKcal: { breakfast: 200, lunch: 0, dinner: 200, snack: 0 } });
  assert.equal(exact.breakfast.content, PACK_LINE);
  assert.equal(exact.dinner.content, PACK_LINE);
  assert.equal(exact.breakfast.enabled, true);
  assert.equal(exact.lunch.content, '');
  assert.equal(exact.snack.enabled, false);
  assert.throws(() => packCategoryMeals({}, { mealEnergyKcal: { breakfast: 199, lunch: 600, dinner: 500, snack: 0 } }));
});
test('AI只提供餐包适用性，具体食谱和第一种大类不受餐包分配影响', () => {
  const result = parseVariants({ ...raw(), meal_pack: { suitable: true } }, assessment);
  assert.equal(result.variants.balanced_recipes.breakfast.content, raw().balanced_recipes.breakfast);
  assert.equal(result.variants.balanced_categories.breakfast.categoryTargetKcal, 510);
  assert.equal(result.variants.meal_pack.breakfast.categoryTargetKcal, 310);
  assert(!result.variants.meal_pack.breakfast.content.includes('谷薯类'));
  const denied = parseVariants({ ...raw(), meal_pack: null, mealPackUnavailableReason: '配料不适用' }, assessment);
  assert(denied.variants.meal_pack.breakfast.content.startsWith(PACK_LINE));
  assert.equal(denied.unavailableReason, '配料不适用');
});

test('仅餐包早晚餐去谷薯，重新分配仍符合预算且不影响午餐加餐或第一种算法', () => {
  const { packCategoryMeals, categoryMeals } = require('../../shared/nutritionMealPlans.cjs');
  const input = { mealEnergyKcal: { breakfast: 524, lunch: 699, dinner: 438, snack: 87 } };
  const ordinary = categoryMeals({}, input);
  const residual = categoryMeals({}, { mealEnergyKcal: packBudgets(input.mealEnergyKcal) });
  const pack = packCategoryMeals({}, input);
  for (const key of ['breakfast', 'dinner']) {
    assert(!/谷薯类|水果|坚果/.test(pack[key].content));
    assert(pack[key].content.startsWith(PACK_LINE));
    assert(Math.abs(pack[key].categoryReferenceKcal + 200 - input.mealEnergyKcal[key]) <= 10);
    assert(ordinary[key].content.includes('谷薯类'));
  }
  for (const key of ['lunch', 'snack']) assert.equal(pack[key].content, residual[key].content);
  const old = { ...residual, breakfast: { ...residual.breakfast, packCategoryVersion: 1, content: PACK_LINE + '\n谷薯类 50克', time: '08:00' }, dinner: { ...residual.dinner, packCategoryVersion: 1, content: PACK_LINE + '\n谷薯类 50克' } };
  const upgraded = packCategoryMeals(old, input);
  assert.equal(upgraded.breakfast.time, '08:00');
  assert(!upgraded.breakfast.content.includes('谷薯类'));
  assert.equal(upgraded.breakfast.content.split(PACK_LINE).length - 1, 1);
  assert.deepEqual(packCategoryMeals(upgraded, input), upgraded);
});

test('模板备注通过备注模块进入客户方案并保留换行，空备注不生成条目', () => {
  const note = '第一条模板说明\n第二条补充说明';
  const items = nutritionPlanItems({ content: { moduleData: { notes: { content: note } } } });
  assert.equal(items.length, 1);
  assert.equal(items[0].name, '备注');
  assert.equal(items[0].notes, '✔ 第一条模板说明\n✔ 第二条补充说明');
  assert.deepEqual(nutritionPlanItems({ content: { moduleData: { notes: { content: '' } } } }), []);
});


test('风险草稿及历史缺失版本可选择餐包，保存仍需人工确认且风险和其他版本保留', () => {
  const risk = '历史海鲜过敏、麸质过敏记录，需核实当前情况';
  const result = parseVariants({ ...raw(), meal_pack: { suitable: false }, mealPackUnavailableReason: risk, categoryExcluded: ['seafood', 'staple'] }, assessment);
  assert.equal(result.unavailableReason, risk);
  const legacy = { balanced_recipes: result.variants.balanced_recipes, balanced_categories: result.variants.balanced_categories };
  legacy.balanced_categories.breakfast.time = '08:15';
  const before = JSON.stringify(legacy);
  const switched = switchMealPlan(legacy, 'balanced_categories', 'meal_pack', legacy.balanced_categories, assessment);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(switched.modules.breakfast.time, '08:15');
  assert(switched.modules.breakfast.content.startsWith(PACK_LINE));
  assert(switched.modules.dinner.content.startsWith(PACK_LINE));
  assert(!switched.modules.lunch.content.includes('水产类'));
  const content = { mealPlanSelection: 'meal_pack', nutritionAssessment: assessment, moduleData: switched.modules, mealPackUnavailableReason: risk };
  assert(mealPlanError(content));
  assert.equal(mealPlanError({ ...content, mealPackSuitabilityConfirmed: true }), null);
  const back = switchMealPlan(switched.variants, 'meal_pack', 'balanced_categories', switched.modules, assessment);
  assert.deepEqual(back.modules.breakfast, legacy.balanced_categories.breakfast);
  assert.throws(() => switchMealPlan(legacy, 'balanced_categories', 'meal_pack', legacy.balanced_categories, { ...assessment, mealEnergyKcal: { ...assessment.mealEnergyKcal, dinner: 199 } }));
});
