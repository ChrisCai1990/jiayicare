const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const OPTIONS = {
  balanced_recipes: '平衡膳食 · 具体食谱',
  balanced_categories: '平衡膳食 · 食物大类',
  meal_pack: '营养餐包＋常规食物',
};
// Label supplied by the product owner, 2026-10-21. Energy budgeting explicitly uses 200 kcal/pack.
const PACK = {
  name: '自研营养餐包', grams: 50, kcal: 200, labelEnergyKj: 855.5,
  proteinG: 13.2, fatG: 6.2, carbohydrateG: 20.8, fibreG: 6, sodiumMg: 170,
  vitaminA_ugRE: 400, vitaminD_ug: 0.75, vitaminE_mgAlphaTE: 6,
  vitaminB1_mg: 0.65, vitaminB2_mg: 0.7, vitaminB6_mg: 0.7, vitaminB12_ug: 1.2,
  vitaminC_mg: 75, niacinMg: 9, folateUgDFE: 162.5, pantothenicAcidMg: 2,
  magnesiumMg: 80, calciumMg: 260, ironMg: 4.75, zincMg: 3.45, taurineMg: 57.5,
};
const PACK_LINE = '自研营养餐包：1包（50 g，计入200 kcal）';
const PLATE_SOURCE = 'https://dg.cnsoc.org/article/04/ya2PbmF0S_CNY0z_Vd9HGQ.html';

function packBudgets(meals) {
  if (!meals || !MEALS.every(key => Number.isInteger(meals[key]) && meals[key] >= 0)
    || meals.breakfast < PACK.kcal || meals.dinner < PACK.kcal) return null;
  return { breakfast: meals.breakfast - PACK.kcal, lunch: meals.lunch, dinner: meals.dinner - PACK.kcal, snack: meals.snack };
}

function snapshotMeals(modules) {
  return Object.fromEntries(MEALS.map(key => [key, { ...(modules[key] || {}) }]));
}

function switchMealPlan(variants, selected, next, modules) {
  if (!Object.hasOwn(OPTIONS, next) || !variants?.[next]) throw new Error('所选配餐草稿不可用，请重新生成');
  const saved = { ...variants, [selected]: snapshotMeals(modules) };
  return { variants: saved, modules: { ...modules, ...snapshotMeals(saved[next]) }, selected: next };
}

function mealPlanError(content = {}) {
  const selected = content.mealPlanSelection;
  if (!selected) return null; // Existing plans keep their historical content.
  if (!Object.hasOwn(OPTIONS, selected)) return '请选择有效配餐方式';
  if (selected !== 'meal_pack') return null;
  if (!packBudgets(content.nutritionAssessment?.mealEnergyKcal)) return '早餐和晚餐预算须各不少于200 kcal，才能各安排一包餐包';
  if (content.mealPackSuitabilityConfirmed !== true) return '请核实餐包完整配料、过敏原及本会员疾病用药适用性';
  for (const key of ['breakfast', 'dinner']) {
    const meal = content.moduleData?.[key];
    if (meal?.enabled === false || !String(meal?.content || '').includes(PACK_LINE)) return '餐包方式须保留早餐、晚餐各一包（50 g、200 kcal）';
  }
  return null;
}

module.exports = { MEALS, OPTIONS, PACK, PACK_LINE, PLATE_SOURCE, packBudgets, snapshotMeals, switchMealPlan, mealPlanError };
