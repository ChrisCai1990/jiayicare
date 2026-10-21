const test = require('node:test');
const assert = require('node:assert/strict');
const { PACK, PACK_LINE, packBudgets, switchMealPlan, mealPlanError } = require('../../shared/nutritionMealPlans.cjs');
const { variantPrompt, parseVariants, categoryText, generateVariants } = require('../src/utils/nutritionMealVariants');
const { nutritionPlanItems } = require('../src/utils/nutritionPlanItems');
const assessment = { managementKcal: 1700, mealEnergyKcal: { breakfast: 510, lunch: 680, dinner: 510, snack: 0 } };
const meals = { breakfast: '主食50 g（生重）', lunch: '蔬菜200 g（可食部）', dinner: '荤菜100 g（可食部）', snack: '' };
const categoryMeals = () => ({ breakfast: [{ category: '主食', amount: 50, unit: 'g', basis: '生重' }], lunch: [{ category: '蔬菜', amount: 200, unit: 'g', basis: '可食部' }], dinner: [{ category: '荤菜', amount: 100, unit: 'g', basis: '可食部' }], snack: [] });
const raw = () => ({ balanced_recipes: { ...meals, breakfast: '燕麦50 g（干重）' }, balanced_categories: categoryMeals(), meal_pack: { ...categoryMeals(), breakfast: [{ category: '杂粮', amount: 20, unit: 'g', basis: '干重' }] } });

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
  const exact = parseVariants({ ...raw(), meal_pack: { ...categoryMeals(), breakfast: [] } }, { ...assessment, mealEnergyKcal: { ...assessment.mealEnergyKcal, breakfast: 200 } });
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

 test('大类输出只允许类别数量与称重口径，拒绝具体食材及括号举例', () => {
  const row = { category: '蔬菜', amount: 230, unit: 'g', basis: '可食部' };
  assert.equal(categoryText([row], 300), '蔬菜：230 g（可食部）');
  for (const invalid of [{ ...row, category: '凉拌金针菇' }, { ...row, category: '蔬菜（芦笋、木耳）' }, { ...row, basis: '芦笋80g、木耳50g、南瓜100g' }, { ...row, amount: '230（芦笋）' }]) assert.throws(() => categoryText([invalid], 300));
  assert.equal(categoryText([row, row], 300), '蔬菜：460 g（可食部）');
  assert.equal(categoryText([{ ...row, food: '芦笋', notes: '蒸芦笋' }], 300), '蔬菜：230 g（可食部）');
  const { variants } = parseVariants(raw(), assessment);
  assert.equal(variants.balanced_categories.breakfast.content, '主食：50 g（生重）');
  assert.equal(variants.meal_pack.breakfast.content, PACK_LINE + '\n杂粮：20 g（干重）');
  assert(variants.balanced_recipes.breakfast.content.includes('燕麦'));
 });

test('兼容数值字符串、中文单位、类别别名及称重口径，零预算忽略空格式差异', () => {
  assert.equal(categoryText([{ category: '奶类', amount: '250', unit: '毫升', basis: '体积' }], 200), '奶制品：250 ml（液体量）');
  assert.equal(categoryText([{ category: '蔬菜类', amount: '100', unit: '克', basis: '可食部重量' }], 200), '蔬菜：100 g（可食部）');
  assert.equal(categoryText('', 0), '');
  assert.equal(categoryText(null, 0), '');
  assert.equal(categoryText([{ category: '主食', amount: 50, unit: 'g', basis: '生重' }, { category: '主食', amount: 100, unit: 'g', basis: '熟重' }], 200), '主食：50 g（生重）\n主食：100 g（熟重）');
});
test('格式失败自动修正一次，成功后返回完整草稿，不把具体食材放入大类', async () => {
  let calls = 0;
  const result = await generateVariants(async messages => {
    calls++;
    if (calls === 1) return JSON.stringify({ ...raw(), description: '测试说明', balanced_categories: { ...categoryMeals(), breakfast: [{ category: '燕麦', amount: 50, unit: 'g', basis: '干重' }] } });
    assert(messages.at(-1).content.includes('balanced_categories.breakfast'));
    return JSON.stringify({ ...raw(), description: '测试说明' });
  }, '测试指令', assessment);
  assert.equal(calls, 2);
  assert.equal(result.variants.balanced_categories.breakfast.content, '主食：50 g（生重）');
  calls = 0;
  await assert.rejects(() => generateVariants(async () => { calls++; return '{}'; }, '测试', assessment), /自动修正后仍不完整/);
  assert.equal(calls, 2);
});

test('餐包晚餐不含主食或杂粮，早餐可有少量杂粮，平衡膳食仍可有主食', () => {
  const { variants } = parseVariants(raw(), assessment);
  assert(variants.meal_pack.breakfast.content.includes('杂粮：20 g（干重）'));
  assert(variants.balanced_categories.breakfast.content.includes('主食'));
  for (const category of ['主食', '杂粮', '谷薯类']) {
    assert.throws(() => parseVariants({ ...raw(), meal_pack: { ...raw().meal_pack, dinner: [{ category, amount: 50, unit: 'g', basis: '生重' }] } }, assessment), /晚餐不得配置/);
  }
  assert.throws(() => parseVariants({ ...raw(), meal_pack: { ...raw().meal_pack, breakfast: categoryMeals().breakfast } }, assessment), /早餐只可少量/);
  assert(parseVariants({ ...raw(), meal_pack: { ...raw().meal_pack, breakfast: [{ category: '蛋类', amount: 50, unit: 'g', basis: '可食部' }] } }, assessment).variants.meal_pack);
});
