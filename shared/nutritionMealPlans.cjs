const { categoryMeals } = require('./nutritionCategoryDisplay.cjs');
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const OPTIONS = {
  balanced_recipes: '平衡膳食 · 具体食谱',
  balanced_categories: '平衡膳食 · 食物大类',
  meal_pack: '营养餐包＋常规食物',
};
// Label supplied by the product owner, 2026-10-21. Energy budgeting explicitly uses 200 kcal/pack.
const PACK = {
  name: '自研营养餐包', grams: 50, kcal: 200, labelEnergyKj: 855.5,
  labelName: '蛋白奶昔·蛋白固体饮料', labelVersion: '2026-10-21',
  ingredients: '分离乳清蛋白、鱼胶原蛋白肽、椰子油粉、大枣粉、全脂乳粉、红豆粉、海藻糖、麦芽糊精、低聚异麦芽糖、大豆分离蛋白、脱脂乳粉、中链甘油三酯微囊粉、魔芋粉、圆苞车前子壳、亚麻籽油粉、抗性糊精、DHA藻油粉（DHA藻油、酪蛋白酸钠、麦芽糊精、抗坏血酸钠）、L-抗坏血酸、dl-α-醋酸生育酚、烟酸、核黄素、醋酸视黄酯、D-泛酸钙、叶酸、盐酸硫胺素、盐酸吡哆醇、氰钴胺、胆钙化醇、碳酸钙、焦磷酸铁、无水硫酸镁、葡萄糖酸锌、牛磺酸',
  allergenStatement: '本品含有鱼制品、乳制品、豆制品、谷物制品，对以上成分过敏者慎用。',
  allergens: ['鱼制品', '乳制品', '豆制品', '谷物制品'],
  preparation: '每次取1袋，加入250–300毫升左右温开水搅拌均匀后食用。',
  labelDailyUse: '每日食用2–3袋（标签原文；本方案按早餐、晚餐各1袋）',
  labelWarning: '本品不适用于婴幼儿食用。本产品不能代替特殊医学用途配方食品、婴幼儿配方食品、保健食品等特殊食品。',
  proteinG: 13.2, fatG: 6.2, carbohydrateG: 20.8, fibreG: 6, sodiumMg: 170,
  vitaminA_ugRE: 400, vitaminD_ug: 0.75, vitaminE_mgAlphaTE: 6,
  vitaminB1_mg: 0.65, vitaminB2_mg: 0.7, vitaminB6_mg: 0.7, vitaminB12_ug: 1.2,
  vitaminC_mg: 75, niacinMg: 9, folateUgDFE: 162.5, pantothenicAcidMg: 2,
  magnesiumMg: 80, calciumMg: 260, ironMg: 4.75, zincMg: 3.45, taurineMg: 57.5,
};
const PACK_LINE = '自研营养餐包：1包（50 g，计入200 kcal）';
const PAGODA_SOURCE = 'https://dg.cnsoc.org/article/04/RMAbPdrjQ6CGWTwmo62hQg.html';

function packBudgets(meals) {
  if (!meals || !MEALS.every(key => Number.isInteger(meals[key]) && meals[key] >= 0)
    || meals.breakfast < PACK.kcal || meals.dinner < PACK.kcal) return null;
  return { breakfast: meals.breakfast - PACK.kcal, lunch: meals.lunch, dinner: meals.dinner - PACK.kcal, snack: meals.snack };
}

function packCategoryMeals(modules = {}, assessment, options = {}) {
  const remaining = packBudgets(assessment?.mealEnergyKcal);
  if (!remaining) throw new Error('早餐和晚餐预算须各不少于200 kcal');
  // The same category allocator receives only the regular-food budget.
  const allocated = Object.values(remaining).some(value => value > 0)
    ? categoryMeals(modules, { ...assessment, mealEnergyKcal: remaining }, { ...options, noStapleMeals: ['breakfast', 'dinner'], packLunch: true })
    : Object.fromEntries(MEALS.map(key => [key, { ...(modules[key] || {}), content: '', categoryBudgetSignature: JSON.stringify([remaining, 'pack-empty-v2']), categoryTargetKcal: 0, categoryReferenceKcal: 0, categoryPortions: [] }]));
  const result = { ...modules };
  for (const key of MEALS) {
    const prior = modules[key] || {};
    const meal = allocated[key];
    if (!options.force && prior.packCategoryVersion === 2 && prior.categoryBudgetSignature && prior.categoryBudgetSignature === meal.categoryBudgetSignature) {
      result[key] = { ...prior };
      continue;
    }
    const fixed = key === 'breakfast' || key === 'dinner';
    result[key] = { ...meal, content: [fixed ? PACK_LINE : '', meal.content].filter(Boolean).join('\n'),
      enabled: assessment.mealEnergyKcal[key] > 0, packCategoryVersion: 2 };
  }
  return result;
}
function prepareMealModules(selected, modules, assessment, options) {
  if (selected === 'balanced_categories') return categoryMeals(modules, assessment, options);
  if (selected === 'meal_pack') return packCategoryMeals(modules, assessment, options);
  return modules;
}

function snapshotMeals(modules) {
  return Object.fromEntries(MEALS.map(key => [key, { ...(modules[key] || {}) }]));
}

function switchMealPlan(variants, selected, next, modules, assessment) {
  if (!Object.hasOwn(OPTIONS, next)) throw new Error('所选配餐草稿不可用，请重新生成');
  const saved = { ...variants, [selected]: snapshotMeals(modules) };
  // Older drafts omitted the pack variant after an AI risk flag. Rebuild only on explicit selection.
  if (next === 'meal_pack' && !saved.meal_pack && packBudgets(assessment?.mealEnergyKcal)) {
    const source = snapshotMeals(saved.balanced_categories || modules);
    saved.meal_pack = packCategoryMeals(source, assessment, { force: true });
  }
  if (!saved[next]) throw new Error('所选配餐草稿不可用，请重新生成');
  return { variants: saved, modules: { ...modules, ...(assessment ? prepareMealModules(next, snapshotMeals(saved[next]), assessment) : snapshotMeals(saved[next])) }, selected: next };
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

module.exports = { prepareMealModules, packCategoryMeals, categoryMeals, MEALS, OPTIONS, PACK, PACK_LINE, PAGODA_SOURCE, packBudgets, snapshotMeals, switchMealPlan, mealPlanError };
