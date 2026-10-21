// Reference allocation, not nutrient analysis of a specific recipe.
// Exchange energy: WS/T 558-2017 Annex E. Food groups: Chinese Food Guide Pagoda 2022.
const VERSION = 2;
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const GROUPS = {
  staple: { label: '主食', kcal: 3.6 }, meat: { label: '荤菜', kcal: 1.8 },
  vegetables: { label: '蔬菜', kcal: 0.18 }, eggs: { label: '蛋类', kcal: 1.8 },
  dairy: { label: '奶制品', kcal: 90 / 160 }, soy: { label: '豆制品', kcal: 90 / 125 },
  fruit: { label: '水果', kcal: 0.45 }, nuts: { label: '坚果', kcal: 6 }, oil: { label: '烹调油', kcal: 9 },
};
const BASIS = '参考克重：主食按生重谷物当量，荤菜、蛋、蔬果按可食部生重，奶制品按液态奶当量，豆制品按含水豆制品参考当量。各类按交换份参考值折算，实际食物可等能量替换。';
function exclusions(assessment = {}, explicit = []) {
  const result = new Set(explicit.filter(key => Object.hasOwn(GROUPS, key)));
  // Conservatively exclude the entire affected group for recorded food allergies.
  if (assessment.allergyStatus === 'confirmed_present') {
    const detail = String(assessment.allergyDetails || '');
    for (const [key, pattern] of Object.entries({ dairy: /奶|乳/, eggs: /蛋/, soy: /豆/, meat: /鱼|虾|蟹|贝|海鲜|肉/, nuts: /坚果|花生|核桃|芝麻/, staple: /麦|谷|麸/ })) {
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
  const fruit = Math.max(0, 275 * scale - (snack.fruit || 0));
  const anchors = {
    breakfast: { vegetables: 50 * scale, eggs: 50 * scale, dairy: milk, oil: 5 * scale, ...(budgets.snack ? {} : { nuts: 10 * scale }) },
    lunch: { meat: 65 * scale, vegetables: 200 * scale, soy: 65 * scale, fruit: fruit / 2, oil: 10 * scale },
    dinner: { meat: 60 * scale, vegetables: 150 * scale, soy: 60 * scale, fruit: fruit / 2, oil: 10 * scale },
  };
  const result = { ...modules };
  const signature = JSON.stringify([budgets, excluded]);
  for (const meal of MEALS) {
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
      const filler = (meal === 'snack' ? ['fruit', 'dairy', 'nuts', 'staple'] : ['staple', 'soy', 'meat', 'dairy']).find(allowed);
      if (!filler) throw new Error('当前类别限制无法满足餐次预算，请调整配餐类别');
      rows[filler] = round((rows[filler] || 0) + (budgets[meal] - energy(rows)) / GROUPS[filler].kcal);
    }
    const portions = Object.entries(GROUPS).filter(([key]) => rows[key] > 0).map(([key, group]) => ({ category: key, grams: rows[key], label: group.label }));
    result[meal] = { ...prior, content: portions.map(row => `${row.label} ${row.grams}克`).join('\n'), enabled: budgets[meal] > 0,
      categoryAllocationVersion: VERSION, categoryBudgetSignature: signature, categoryExcluded: excluded,
      categoryPortions: portions, categoryReferenceKcal: Math.round(energy(rows)), categoryTargetKcal: budgets[meal], categoryWeightBasis: BASIS };
    delete result[meal].categorySource;
  }
  return result;
}
module.exports = { VERSION, GROUPS, BASIS, exclusions, categoryMeals };
