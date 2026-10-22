const test = require('node:test');
const assert = require('node:assert/strict');
const { categoryMeals, GROUPS } = require('../../shared/nutritionCategoryDisplay.cjs');
const { parseVariants } = require('../src/utils/nutritionMealVariants');
const { switchMealPlan } = require('../../shared/nutritionMealPlans.cjs');
const { nutritionPlanItems } = require('../src/utils/nutritionPlanItems');
const assessment = { managementKcal: 1850, mealEnergyKcal: { breakfast: 555, lunch: 740, dinner: 555, snack: 0 } };
const keys = ['breakfast', 'lunch', 'dinner', 'snack'];
test('直接按最终预算分配三餐大类，忽略旧食谱与待核对占位文本', () => {
  const old = { breakfast: { content: '蔬菜180g，具体食谱', time: '08:00' }, lunch: { content: '食物类别及分量待核对' } };
  const result = categoryMeals(old, assessment);
  assert.equal(result.breakfast.time, '08:00');
  for (const key of keys.slice(0, 3)) {
    assert(result[key].content.includes('谷薯类 '));
    assert(result[key].content.includes('蔬菜 '));
    assert(!/待核对|食谱|具体/.test(result[key].content));
    assert(Math.abs(result[key].categoryReferenceKcal - assessment.mealEnergyKcal[key]) <= 10);
    for (const row of result[key].content.split('\n')) assert.match(row, /^(谷薯类|畜禽肉|水产类|蔬菜|蛋类|奶制品|豆制品|水果|坚果|烹调油) \d+克$/);
  }
  assert(result.breakfast.content.includes('蛋类 '));
  assert(result.breakfast.content.includes('奶制品 '));
  assert(result.lunch.content.includes('畜禽肉 '));
  assert(result.dinner.content.includes('畜禽肉 '));
  assert.equal(result.snack.content, '');
  assert.equal(result.snack.enabled, false);
});
test('不同总能量及餐次比例分配，取整误差可控，油脂计入预算', () => {
  for (const total of [1200, 1500, 1700, 1850, 2000, 2400, 3000, 6000]) {
    for (const fractions of [[0.3,0.4,0.3,0],[0.25,0.4,0.25,0.1],[0.2,0.3,0.3,0.2]]) {
      const budget = Object.fromEntries(keys.map((key, i) => [key, total * fractions[i]]));
      const result = categoryMeals({}, { mealEnergyKcal: budget });
      for (const key of keys) {
        const measured = result[key].categoryPortions.reduce((sum, row) => sum + row.grams * GROUPS[row.category].kcal, 0);
        assert(Math.abs(measured - budget[key]) <= 10, `${total} ${key}: ${measured}`);
        assert(result[key].categoryPortions.every(row => row.grams > 0 && Number.isInteger(row.grams)));
      }
      assert(result.breakfast.content.includes('烹调油'));
    }
  }
});
test('保留人工调整与时间，预算变化才重新分配；切换不影响另两种算法', () => {
  const result = categoryMeals({}, assessment);
  result.breakfast.content = '主食 60克\n蛋类 50克';
  assert.deepEqual(categoryMeals(result, assessment), result);
  const variants = { balanced_categories: result, balanced_recipes: { breakfast: { content: '具体食谱' } } };
  const switched = switchMealPlan(variants, 'balanced_categories', 'balanced_recipes', result, assessment);
  const restored = switchMealPlan(switched.variants, 'balanced_recipes', 'balanced_categories', switched.modules, assessment);
  assert.equal(restored.modules.breakfast.content, result.breakfast.content);
  assert.equal(switched.modules.breakfast.content, '具体食谱');
  const changed = categoryMeals(result, { mealEnergyKcal: { breakfast: 600, lunch: 800, dinner: 600, snack: 0 } });
  assert.notEqual(changed.breakfast.content, result.breakfast.content);
});
test('过敏和AI禁用类别不会重新加入；新生成无需AI大类文本，客户items只含当前版本', () => {
  const meals = { breakfast: '燕麦50g', lunch: '蔬菜200g', dinner: '荤菜100g', snack: '' };
  const { variants } = parseVariants({ balanced_recipes: meals, meal_pack: meals, categoryExcluded: ['soy'] }, { ...assessment, allergyStatus: 'confirmed_present', allergyDetails: '牛奶和鸡蛋过敏' });
  for (const key of keys) assert(!/奶制品|蛋类|豆制品/.test(variants.balanced_categories[key].content));
  assert.equal(variants.balanced_recipes.breakfast.content, meals.breakfast);
  assert(variants.meal_pack.breakfast.content.endsWith(meals.breakfast));
  const items = nutritionPlanItems({ content: { moduleData: variants.balanced_categories }, items: [] });
  assert(!items.some(item => /待核对|燕麦/.test(item.notes)));
});

test('客户方案单独提供称重说明，三餐内容仍只显示大类和克重', () => {
  const modules = categoryMeals({}, assessment);
  const items = nutritionPlanItems({ content: { mealPlanSelection: 'balanced_categories', moduleData: modules } });
  assert.equal(items.filter(item => item.name === '分量说明').length, 1);
  assert(items.find(item => item.name === '分量说明').notes.includes('生重'));
  assert(!items.find(item => item.name.startsWith('午餐')).notes.includes('当量'));
  const other = nutritionPlanItems({ content: { mealPlanSelection: 'balanced_recipes', moduleData: modules } });
  assert(!other.some(item => item.name === '分量说明'));
});

test('水果坚果仅在加餐，三餐区分畜禽肉与水产且零加餐不回填', () => {
  for (const snack of [0, 185]) {
    const input = { mealEnergyKcal: { breakfast: 555, lunch: 740, dinner: 555 - snack, snack } };
    const result = categoryMeals({}, input);
    for (const meal of ['breakfast','lunch','dinner']) {
      assert(!/水果|坚果/.test(result[meal].content));
      assert(result[meal].content.includes('谷薯类'));
      assert(!/主食|荤菜/.test(result[meal].content));
    }
    assert(result.lunch.content.includes('畜禽肉'));
    assert(result.lunch.content.includes('水产类'));
    if (snack) assert(/水果/.test(result.snack.content) && /坚果/.test(result.snack.content));
    else assert.equal(result.snack.content, '');
  }
});
test('水产禁忌不补回水产，旧版荤菜禁忌兼容两类', () => {
  const result = categoryMeals({}, { ...assessment, allergyStatus: 'confirmed_present', allergyDetails: '海鲜过敏' });
  assert(!result.lunch.content.includes('水产类'));
  assert(result.lunch.content.includes('畜禽肉'));
  const legacy = categoryMeals({ breakfast: { categoryAllocationVersion: 2, categoryExcluded: ['meat'] } }, assessment);
  assert(!/畜禽肉|水产类/.test(legacy.lunch.content));
});
