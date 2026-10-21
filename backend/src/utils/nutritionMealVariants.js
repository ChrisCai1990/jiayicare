const { MEALS, PACK, PACK_LINE, PLATE_SOURCE, packBudgets } = require('../../../shared/nutritionMealPlans.cjs');

function variantPrompt(assessment) {
  const remainder = packBudgets(assessment.mealEnergyKcal);
  return `【配餐方式与呈现】
同一最终管理期能量生成可供营养师选择的配餐草稿。
balanced_recipes：遵循中国居民平衡膳食餐盘（2022），给出具体食谱、食材和克数（奶类可用ml）。
balanced_categories：同样遵循餐盘，使用主食、荤菜、蔬菜、水果、奶制品、蛋类、豆制品等大类及克数，不写具体菜名或食材品种。
餐盘依据：${PLATE_SOURCE}。餐盘包含谷薯、鱼肉蛋豆、蔬菜、水果，配合奶类；这是食物组成的大致比例，不能等同热量或重量比例。结合会员年龄、能量目标、模板、已核实过敏禁忌与偏好分配，主食注明生重或熟重，其余注明可食部重量，烹调油计入预算，不能强行给不适宜的类别。
${remainder ? `meal_pack：早餐和晚餐由系统各固定加入一包营养餐包（50g、200 kcal），每日两包共400 kcal，已包含在每日总预算中。你只输出搭配的常规食物，禁止再次写餐包、代餐粉或重复扣减。常规食物预算：早餐${remainder.breakfast}、午餐${remainder.lunch}、晚餐${remainder.dinner}、加餐${remainder.snack} kcal；为0的餐次输出空字符串。按具体食物及重量安排，考虑餐包已提供的蛋白质、脂肪、碳水等，不能在完整常规三餐之上额外叠加餐包。
每包营养成分：${JSON.stringify(PACK)}。标签855.5kJ约204.5kcal，产品方指定配餐预算按200kcal；不修改标签原值。尚无完整配料及过敏原资料，不得宣称餐包无过敏原、适合所有疾病或具有治疗作用；如已知疾病、用药、过敏与餐包营养信息冲突，meal_pack返回null并在mealPackUnavailableReason说明。` : 'meal_pack返回null；mealPackUnavailableReason写早餐或晚餐预算不足200 kcal。'}
各版本均按最终管理期每日能量及餐次预算提供参考分量；不得虚构精确食物热量，不承诺实际摄入已准确核算。每行一个食物/类别及数量，加餐预算0时snack留空。
仅输出JSON：{"description":"共用方案说明，明确最终管理期每日能量，不绑定某一配餐方式","balanced_recipes":{"breakfast":"...","lunch":"...","dinner":"...","snack":"..."},"balanced_categories":{"breakfast":"...","lunch":"...","dinner":"...","snack":"..."},"meal_pack":{"breakfast":"仅常规食物","lunch":"...","dinner":"仅常规食物","snack":"..."},"mealPackUnavailableReason":"不可用原因或空字符串"}`;
}

function parseVariants(raw, assessment) {
  const variants = {};
  const remainder = packBudgets(assessment.mealEnergyKcal);
  for (const key of ['balanced_recipes', 'balanced_categories', 'meal_pack']) {
    if (key === 'meal_pack' && (!remainder || raw[key] === null)) continue;
    const budgets = key === 'meal_pack' ? remainder : assessment.mealEnergyKcal;
    const data = raw[key];
    if (!data || MEALS.some(meal => typeof data[meal] !== 'string' || (budgets[meal] > 0 && !data[meal].trim()))) throw new Error('AI未生成完整的多种配餐草稿，请重试');
    if (key === 'meal_pack' && MEALS.some(meal => /餐包|代餐粉/.test(data[meal]))) throw new Error('AI重复安排了餐包，请重试');
    variants[key] = Object.fromEntries(MEALS.map(meal => {
      const regular = budgets[meal] > 0 ? data[meal].trim() : '';
      const content = key === 'meal_pack' && ['breakfast', 'dinner'].includes(meal) ? [PACK_LINE, regular].filter(Boolean).join('\n') : regular;
      return [meal, { content, enabled: assessment.mealEnergyKcal[meal] > 0 }];
    }));
  }
  return { variants, unavailableReason: !remainder ? '早餐和晚餐预算须各不少于200 kcal' : !variants.meal_pack ? String(raw.mealPackUnavailableReason || '餐包适用性需进一步评估').slice(0, 500) : '' };
}
module.exports = { variantPrompt, parseVariants };
