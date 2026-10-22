const MODULES = [
  ['breakfast', '早餐方案', '早餐', '07:30-08:00'],
  ['lunch', '午餐方案', '午餐', '11:30-12:00'],
  ['dinner', '晚餐方案', '晚餐', '18:00-18:30'],
  ['snack', '加餐方案', '加餐', '15:00-15:30'],
  ['principle', '饮食原则'],
  ['forbidden', '可选食物库'],
  ['supplement', '营养补充信息'],
  ['exercise', '运动建议'],
  ['notes', '备注'],
];

function nutritionPlanItems(plan) {
  const modules = plan.content?.moduleData;
  if (!modules || typeof modules !== 'object') return plan.items || [];
  const oldItems = plan.items || [];
  const items = MODULES.flatMap(([key, name, meal, defaultTime]) => {
    const data = modules[key] || {};
    if (data.enabled === false) return [];
    const lines = meal
      ? String(data.content || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => /^([✔✓☑]|或(?:\s|$))/u.test(line) ? line : `✔ ${line}`)
      : key === 'principle' ? [
          data.dietPrinciple && `✔ 膳食总原则：${data.dietPrinciple}`,
          data.cookingMethod && `✔ 烹饪方式：${data.cookingMethod}`,
          data.mealOrder && `✔ 进餐顺序：${data.mealOrder}`,
          data.dailyWater && `✔ 每日饮水量：${data.dailyWater}`,
        ].filter(Boolean)
      : key === 'forbidden' ? [
          data.allowedFoods && `✔ 推荐食物：${data.allowedFoods}`,
          data.forbiddenFoods && `✔ 禁忌食物：${data.forbiddenFoods}`,
        ].filter(Boolean)
      : String(data.content || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => `✔ ${line}`);
    if (!lines.length) return [];
    const old = oldItems.find(item => item.name === name || (key === 'forbidden' && item.name === '禁忌食物') || (meal && String(item.name || '').startsWith(`${meal}（`)));
    const time = String(data.time || defaultTime || '').trim();
    return [{
      ...(old?.toObject ? old.toObject() : old || {}),
      name: meal ? `${meal}（${time}）` : name,
      category: key === 'exercise' ? '运动康复' : '营养干预',
      notes: lines.join('\n'),
      status: old?.status || 'pending',
    }];
  });
  if (['balanced_categories', 'meal_pack'].includes(plan.content?.mealPlanSelection) && modules.breakfast?.categoryWeightBasis) {
    const previous = oldItems.find(item => item.name === '分量说明');
    items.push({ ...(previous?.toObject ? previous.toObject() : previous || {}), name: '分量说明', category: '营养干预',
      notes: modules.breakfast.categoryWeightBasis, status: previous?.status || 'pending' });
  }
  return items;
}

module.exports = { nutritionPlanItems };
