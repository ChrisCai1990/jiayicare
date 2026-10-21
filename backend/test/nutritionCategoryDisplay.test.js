const test = require('node:test');
const assert = require('node:assert/strict');
const { categoryDisplay, categoryMeals } = require('../../shared/nutritionCategoryDisplay.cjs');
const { parseVariants } = require('../src/utils/nutritionMealVariants');
const { switchMealPlan, mealPlanError } = require('../../shared/nutritionMealPlans.cjs');
const source = '蔬菜（芦笋，80g；番茄，100g）\n豆制品（北豆腐，50g）\n水果（苹果，75g）';
const expected = '蔬菜 180 g\n豆制品 50 g\n水果 75 g';
test('截图中的食材只呈现大类和合计分量，重复整理不改变结果', () => {
  assert.equal(categoryDisplay(source), expected);
  assert.equal(categoryDisplay(expected), expected);
  assert.equal(categoryDisplay('蔬菜180g（芦笋80g、番茄100g）'), '蔬菜 180 g');
  assert.equal(categoryDisplay('奶制品（牛奶250毫升）'), '奶制品 250 ml');
});
test('不混加不同重量口径、备选分量或计数与重量，保留原始依据', () => {
  for (const line of ['主食（米饭100g熟重、燕麦30g干重）', '水果（苹果100g或梨120g）', '蛋类（鸡蛋1个约50g）', '蔬菜100–200g']) {
    const result = categoryMeals({ breakfast: { content: line, time: '08:00' } });
    assert(result.breakfast.content.includes('待核对'));
    assert.equal(result.breakfast.categorySource, line);
    assert.equal(result.breakfast.time, '08:00');
    assert(mealPlanError({ mealPlanSelection: 'balanced_categories', moduleData: result }));
  }
});
test('生成与旧草稿切换仅整理大类版本，具体食谱及餐包常规食物不变', () => {
  const meals = { breakfast: source, lunch: '蔬菜200g', dinner: '荤菜100g', snack: '' };
  const { variants } = parseVariants({ balanced_recipes: meals, balanced_categories: meals, meal_pack: meals }, { mealEnergyKcal: { breakfast: 500, lunch: 700, dinner: 500, snack: 0 } });
  assert.equal(variants.balanced_categories.breakfast.content, expected);
  assert.equal(variants.balanced_recipes.breakfast.content, source);
  assert(variants.meal_pack.breakfast.content.endsWith(source));
  const old = { ...variants, balanced_categories: { breakfast: { content: source } } };
  const switched = switchMealPlan(old, 'balanced_recipes', 'balanced_categories', variants.balanced_recipes);
  assert.equal(switched.modules.breakfast.content, expected);
  assert.equal(switched.variants.balanced_recipes.breakfast.content, source);
});
