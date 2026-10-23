const { MEALS, PACK, PAGODA_SOURCE, packBudgets, categoryMeals, packCategoryMeals } = require('../../../shared/nutritionMealPlans.cjs');

function variantPrompt(assessment) {
  const remainder = packBudgets(assessment.mealEnergyKcal);
  return `【配餐方式与呈现】
同一最终管理期能量生成可供营养师选择的配餐草稿。各版本独立生成：balanced_categories的类别与水果坚果加餐限定只适用于该版本，不适用于balanced_recipes；meal_pack的餐包要求与产品资料仅用于meal_pack，不得将营养餐包加入balanced_recipes。
balanced_recipes：遵循中国居民平衡膳食宝塔（2022），给出具体食谱、食材和克数（奶类可用ml）。
balanced_categories：由系统根据最终餐次预算、宝塔食物类别和交换份参考均值直接计算克重，无需生成具体食谱或大类文字。类别为谷薯类、畜禽肉、水产类、蛋类、奶制品、蔬菜、水果、豆制品、坚果、烹调油；水果和坚果仅分配到加餐。返回categoryExcluded数组：根据已核实过敏、疾病、用药、饮食禁忌，列出必须排除的类别键（staple/meat/seafood/vegetables/eggs/dairy/soy/fruit/nuts/oil）；无禁忌返回[]。只针对确有依据的禁忌，不随意排除类别；需限量而非禁用的个体化要求写入description供营养师调整。
宝塔依据：${PAGODA_SOURCE}。按谷薯类、蔬菜水果、鱼禽肉蛋、奶类大豆坚果、油盐五层组织食物量化分配。宝塔建议量是每日参考，不是每餐都照搬同一克重；结合最终管理期能量和餐次比例分配，图形层级不能等同热量或重量比例。结合会员年龄、能量目标、模板、已核实过敏禁忌与偏好分配，主食注明生重或熟重，其余注明可食部重量，烹调油计入预算，不能强行给不适宜的类别。
${remainder ? `meal_pack：早餐和晚餐由系统各固定加入一包营养餐包（50g、200 kcal），每日两包共400 kcal，已包含在每日总预算中。常规食物由系统使用与balanced_categories相同的大类分配器生成“大类＋克重”，不输出具体食谱、不输出“仅常规食物”等占位内容。常规食物预算：早餐${remainder.breakfast}、午餐${remainder.lunch}、晚餐${remainder.dinner}、加餐${remainder.snack} kcal。早餐、晚餐常规食物不搭配谷薯类，在各餐剩余预算内分配其他允许类别；午餐保留谷薯类。水果和坚果仅入加餐。你只提供餐包适用性风险提示：未发现冲突返回meal_pack:{"suitable":true}，发现冲突返回meal_pack:{"suitable":false}并说明具体依据，最终由营养师结合当前情况二次评估。类别禁忌使用categoryExcluded。
餐包标签及每包营养成分：${JSON.stringify(PACK)}。标签855.5kJ约204.5kcal，产品方指定配餐预算按200kcal；不修改标签原值。配料及致敏源来自产品方提供的完整包装：包含鱼、乳、豆、谷物制品。逐项核对已核实过敏详情、配料、疾病、用药及模板禁忌；如存在冲突，在mealPackUnavailableReason保留具体风险依据，区分历史记录与当前已核实情况，不得自行认定过敏已消失；风险提示不禁用配餐选项，由营养师复核当前适用性，不得以去掉某一常规食物来消除餐包自身的过敏原。不得宣称无过敏原、适合所有疾病、可替代特殊医学用途配方食品或具有治疗作用。标签食用方法仅作产品信息，本方案仍固定早晚各1袋，不额外增加第三袋；用水冲调，另加奶等须计入剩余食物预算。` : 'meal_pack返回null；mealPackUnavailableReason写早餐或晚餐预算不足200 kcal。'}
各版本均按最终管理期每日能量及餐次预算提供参考分量；不得虚构精确食物热量，不承诺实际摄入已准确核算。每行一个食物/类别及数量，加餐预算0时snack留空。
仅输出JSON：{"description":"共用方案说明，明确最终管理期每日能量，不绑定某一配餐方式","balanced_recipes":{"breakfast":"...","lunch":"...","dinner":"...","snack":"..."},"categoryExcluded":[],"meal_pack":{"suitable":true},"mealPackUnavailableReason":"待营养师二次评估的具体风险提示或空字符串"}`;
}

function parseVariants(raw, assessment) {
  const variants = {};
  const remainder = packBudgets(assessment.mealEnergyKcal);
  const data = raw.balanced_recipes;
  if (!data || MEALS.some(meal => typeof data[meal] !== 'string' || (assessment.mealEnergyKcal[meal] > 0 && !data[meal].trim()))) throw new Error('AI未生成完整的具体食谱草稿，请重试');
  variants.balanced_recipes = Object.fromEntries(MEALS.map(meal => [meal, { content: assessment.mealEnergyKcal[meal] > 0 ? data[meal].trim() : '', enabled: assessment.mealEnergyKcal[meal] > 0 }]));
  const excluded = raw.categoryExcluded || [];
  if (!Array.isArray(excluded) || excluded.some(key => !Object.hasOwn(require('../../../shared/nutritionCategoryDisplay.cjs').GROUPS, key))) throw new Error('配餐类别限制格式错误，请重新生成');
  variants.balanced_categories = categoryMeals({}, assessment, { excluded });
  if (remainder) {
    if (raw.meal_pack !== null && (!raw.meal_pack || (typeof raw.meal_pack.suitable !== 'boolean' && !(raw.meal_pack.suitable === undefined && MEALS.every(key => typeof raw.meal_pack[key] === 'string'))))) throw new Error('AI未返回餐包适用性结果，请重试');
    variants.meal_pack = packCategoryMeals({}, assessment, { excluded });
  }
  return { variants, unavailableReason: !remainder ? '早餐和晚餐预算须各不少于200 kcal' : String(raw.mealPackUnavailableReason || (raw.meal_pack === null || raw.meal_pack?.suitable === false ? '餐包适用性需进一步评估' : '')).slice(0, 500) };
}
module.exports = { variantPrompt, parseVariants };
