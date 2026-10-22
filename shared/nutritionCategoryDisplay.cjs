// Reference allocation, not nutrient analysis of a specific recipe.
// Exchange energy: WS/T 558-2017 Annex E. Food groups: Chinese Food Guide Pagoda 2022.
const VERSION = 3;
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const GROUPS = {
  staple: { label: '谷薯类', kcal: 3.6 }, meat: { label: '畜禽肉', kcal: 1.8 },
  seafood: { label: '水产类', kcal: 90 / 80 },
  eggs: { label: '蛋类', kcal: 1.8 }, dairy: { label: '奶制品', kcal: 90 / 160 },
  vegetables: { label: '蔬菜', kcal: 0.18 }, fruit: { label: '水果', kcal: 0.45 },
  soy: { label: '豆制品', kcal: 90 / 125 }, nuts: { label: '坚果', kcal: 6 }, oil: { label: '烹调油', kcal: 9 },
};
const BASIS = '参考克重：谷薯类按生重谷物当量，畜禽肉、水产类、蛋、蔬果按可食部生重，奶制品按液态奶当量，豆制品按含水豆制品参考当量。各类按交换份参考值折算，实际食物可等能量替换。';
function exclusions(assessment = {}, explicit = []) {
  const result = new Set(explicit.filter(key => Object.hasOwn(GROUPS, key)));
  // Conservatively exclude the entire affected group for recorded food allergies.
  if (assessment.allergyStatus === 'confirmed_present') {
    const detail = String(assessment.allergyDetails || '');
    for (const [key, pattern] of Object.entries({ dairy: /奶|乳/, eggs: /蛋/, soy: /豆/, meat: /畜禽|猪|牛肉|羊|鸡肉|鸭肉|鹅肉/, seafood: /鱼|虾|蟹|贝|海鲜|水产/, nuts: /坚果|花生|核桃|芝麻/, staple: /麦|谷|麸/ })) {
      if (pattern.test(detail)) result.add(key);
    }
  }
  return [...result];
}
function categoryMeals(modules = {}, assessment, options = {}) {
  const budgets = assessment?.mealEnergyKcal;
  if (!budgets || !MEALS.every(key => Number.isFinite(budgets[key]) && budgets[key] >= 0)) throw new Error('请先确认管理期每日能量及餐次比例');
  const total = MEALS.reduce((sum, key) => sum + budgets[key], 0);
  if (!(total > 0)) throw new Error('请先确认管理期每日能量及餐次比例');
  const excluded = exclusions(assessment, options.excluded || modules.breakfast?.categoryExcluded || []);
  // Legacy 'meat' exclusions covered both land meat and seafood.
  if (modules.breakfast?.categoryAllocationVersion < VERSION && excluded.includes('meat') && !excluded.includes('seafood')) excluded.push('seafood');
  const allowed = key => !excluded.includes(key);
  const scale = Math.min(1.5, Math.max(0.8, total / 1800));
  const round = (n, step = 5) => Math.max(0, Math.round(n / step) * step);
  const energy = rows => Object.entries(rows).reduce((sum, [key, g]) => sum + g * GROUPS[key].kcal, 0);
  const snack = {};
  const snackWeights = { dairy: 0.5, fruit: 0.35, nuts: 0.15 };
  const snackTotal = Object.entries(snackWeights).filter(([key]) => allowed(key)).reduce((sum, [, weight]) => sum + weight, 0);
  if (budgets.snack > 0 && snackTotal) for (const [key, weight] of Object.entries(snackWeights)) {
    if (allowed(key)) snack[key] = round(budgets.snack * weight / snackTotal / GROUPS[key].kcal);
  }
  const milk = Math.max(0, 300 * scale - (snack.dairy || 0));
  const anchors = {
    breakfast: { vegetables: 50 * scale, eggs: 50 * scale, dairy: milk, oil: 5 * scale },
    lunch: { meat: 35 * scale, seafood: 40 * scale, vegetables: 200 * scale, soy: 65 * scale, oil: 10 * scale },
    dinner: { meat: 30 * scale, seafood: 40 * scale, vegetables: 150 * scale, soy: 60 * scale, oil: 10 * scale },
  };
  const result = { ...modules };
  for (const meal of MEALS) {
    const noStaple = options.noStapleMeals?.includes(meal) === true;
    // A specific wheat/gluten restriction is not a ban on every grain/tuber.
    // Scope the alternative to pack lunch; retain all other meal/category restrictions.
    const glutenLunch = options.packLunch === true && meal === 'lunch'
      && /麸|小麦|大麦|黑麦/.test(String(assessment?.allergyDetails || ''))
      && !/全部谷薯|所有谷薯|禁用谷薯|谷薯类禁忌/.test(String(assessment?.allergyDetails || ''));
    const mealAllowed = key => (glutenLunch && key === 'staple') || allowed(key);
    const signature = JSON.stringify(glutenLunch ? [budgets, excluded, 'pack-gluten-lunch-v1'] : noStaple ? [budgets, excluded, 'no-staple-v1'] : [budgets, excluded]);
    const prior = modules[meal] || {};
    // Preserve a nutritionist's edits after initial allocation, including switching versions.
    if (!options.force && prior.categoryAllocationVersion === VERSION && prior.categoryBudgetSignature === signature) { result[meal] = { ...prior }; continue; }
    let rows = {};
    if (budgets[meal] > 0) {
      if (meal === 'snack') rows = { ...snack };
      else {
        rows = Object.fromEntries(Object.entries(anchors[meal]).filter(([key]) => allowed(key)));
        const ratio = Math.min(1, budgets[meal] * 0.65 / Math.max(1, energy(rows)));
        rows = Object.fromEntries(Object.entries(rows).map(([key, g]) => [key, round(g * ratio, key === 'oil' ? 1 : 5)]));
      }
      // Use a permitted category for the remaining energy, never add cooking oil as a filler.
      if (noStaple) {
        // Pack breakfast/dinner: spread the remaining energy across permitted protein groups.
        const candidates = (meal === 'breakfast' ? ['eggs', 'dairy', 'soy', 'meat', 'seafood'] : ['meat', 'seafood', 'soy', 'dairy', 'eggs']).filter(allowed);
        const present = candidates.filter(key => rows[key] > 0);
        const fillers = present.length ? present : candidates.slice(0, 2);
        if (!fillers.length) throw new Error('当前类别限制无法满足无谷薯类餐次预算，请调整配餐类别');
        const weights = fillers.map(key => rows[key] ? rows[key] * GROUPS[key].kcal : 1);
        const weightTotal = weights.reduce((sum, value) => sum + value, 0);
        const remainder = budgets[meal] - energy(rows);
        fillers.forEach((key, i) => { rows[key] = round((rows[key] || 0) + remainder * weights[i] / weightTotal / GROUPS[key].kcal); });
        const correction = fillers[0];
        rows[correction] = round(rows[correction] + (budgets[meal] - energy(rows)) / GROUPS[correction].kcal, 1);
      } else {
        const filler = (meal === 'snack' ? ['fruit', 'dairy', 'nuts', 'staple'] : ['staple', 'soy', 'meat', 'seafood', 'dairy']).find(mealAllowed);
        if (!filler) throw new Error('当前类别限制无法满足餐次预算，请调整配餐类别');
        rows[filler] = round((rows[filler] || 0) + (budgets[meal] - energy(rows)) / GROUPS[filler].kcal);
      }
    }
    const portions = Object.entries(GROUPS).filter(([key]) => rows[key] > 0).map(([key, group]) => ({ category: key, grams: rows[key], label: glutenLunch && key === 'staple' ? '谷薯类（无麸质，需核对过敏适用性）' : group.label }));
    result[meal] = { ...prior, content: portions.map(row => `${row.label} ${row.grams}克`).join('\n'), enabled: budgets[meal] > 0,
      categoryAllocationVersion: VERSION, categoryBudgetSignature: signature, categoryExcluded: excluded,
      categoryPortions: portions, categoryReferenceKcal: Math.round(energy(rows)), categoryTargetKcal: budgets[meal], categoryWeightBasis: BASIS };
    delete result[meal].categorySource;
  }
  return result;
}
module.exports = { VERSION, GROUPS, BASIS, exclusions, categoryMeals };
