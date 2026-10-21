const { MEALS, PACK, PACK_LINE, PLATE_SOURCE, packBudgets } = require('../../../shared/nutritionMealPlans.cjs');
const CATEGORIES = ['主食', '荤菜', '蔬菜', '水果', '奶制品', '蛋类', '豆制品', '坚果', '油脂'];
function categoryText(rows, budget) {
  if (!Array.isArray(rows) || rows.length > 20 || (budget > 0 && !rows.length)) throw new Error('AI食物大类格式不完整，请重新生成');
  const seen = new Set();
  return rows.map(row => {
    if (!row || Object.keys(row).some(key => !['category', 'amount', 'unit', 'basis'].includes(key))
      || !CATEGORIES.includes(row.category) || seen.has(row.category)
      || typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount <= 0 || row.amount > 3000
      || !['g', 'ml'].includes(row.unit) || !['生重', '熟重', '干重', '可食部', '液体量'].includes(row.basis)
      || (row.unit === 'ml' && (row.category !== '奶制品' || row.basis !== '液体量'))
      || (row.unit === 'g' && row.basis === '液体量')) throw new Error('AI大类草稿包含具体食物或无效分量，请重新生成');
    seen.add(row.category);
    return `${row.category}：${row.amount} ${row.unit}（${row.basis}）`;
  }).join('\n');
}

function variantPrompt(assessment) {
  const remainder = packBudgets(assessment.mealEnergyKcal);
  return `【配餐方式与呈现】
同一最终管理期能量生成可供营养师选择的配餐草稿。
balanced_recipes：遵循中国居民平衡膳食餐盘（2022），给出具体食谱、食材和克数（奶类可用ml）。
balanced_categories和meal_pack：只呈现食物大类及总分量，禁止具体食物、菜名、食材品种、括号举例。类别限定为${CATEGORIES.join('、')}。同一类别每餐仅一项，先合计该类分量；称重口径须一致，不可把生重与熟重相加。
餐盘依据：${PLATE_SOURCE}。餐盘包含谷薯、鱼肉蛋豆、蔬菜、水果，配合奶类；这是食物组成的大致比例，不能等同热量或重量比例。结合会员年龄、能量目标、模板、已核实过敏禁忌与偏好分配，主食注明生重或熟重，其余注明可食部重量，烹调油计入预算，不能强行给不适宜的类别。
${remainder ? `meal_pack：早餐和晚餐由系统各固定加入一包营养餐包（50g、200 kcal），每日两包共400 kcal，已包含在每日总预算中。你只输出搭配的常规食物大类和分量，禁止再次写餐包、代餐粉或重复扣减。常规食物预算：早餐${remainder.breakfast}、午餐${remainder.lunch}、晚餐${remainder.dinner}、加餐${remainder.snack} kcal；为0的餐次输出空数组。按食物大类及重量安排，考虑餐包已提供的蛋白质、脂肪、碳水等，不能在完整常规三餐之上额外叠加餐包。
餐包标签及每包营养成分：${JSON.stringify(PACK)}。标签855.5kJ约204.5kcal，产品方指定配餐预算按200kcal；不修改标签原值。配料及致敏源来自产品方提供的完整包装：包含鱼、乳、豆、谷物制品。逐项核对已核实过敏详情、配料、疾病、用药及模板禁忌；如存在冲突，meal_pack必须返回null并在mealPackUnavailableReason说明具体依据，不得以去掉某一常规食物来消除餐包自身的过敏原。不得宣称无过敏原、适合所有疾病、可替代特殊医学用途配方食品或具有治疗作用。标签食用方法仅作产品信息，本方案仍固定早晚各1袋，不额外增加第三袋；用水冲调，另加奶等须计入剩余食物预算。` : 'meal_pack返回null；mealPackUnavailableReason写早餐或晚餐预算不足200 kcal。'}
各版本均按最终管理期每日能量及餐次预算提供参考分量；不得虚构精确食物热量，不承诺实际摄入已准确核算。每行一个食物/类别及数量，加餐预算0时snack留空。
仅输出JSON。balanced_recipes的四餐仍为字符串；balanced_categories和meal_pack的每餐必须是数组，元素严格只有category、amount、unit、basis四个字段，不输出其他说明字段。amount为正数，unit为g或ml；basis为生重、熟重、干重、可食部或液体量；ml只用于奶制品且basis须为液体量，g不搭配液体量。零预算返回[]。示例结构（分量按实际预算计算，不照抄）：
{"description":"共用方案说明，明确最终管理期每日能量，不绑定某一配餐方式","balanced_recipes":{"breakfast":"...","lunch":"...","dinner":"...","snack":""},"balanced_categories":{"breakfast":[{"category":"主食","amount":50,"unit":"g","basis":"生重"}],"lunch":[],"dinner":[],"snack":[]},"meal_pack":{"breakfast":[],"lunch":[],"dinner":[],"snack":[]},"mealPackUnavailableReason":"不可用原因或空字符串"}`;
}

function parseVariants(raw, assessment) {
  const variants = {};
  const remainder = packBudgets(assessment.mealEnergyKcal);
  for (const key of ['balanced_recipes', 'balanced_categories', 'meal_pack']) {
    if (key === 'meal_pack' && (!remainder || raw[key] === null)) continue;
    const budgets = key === 'meal_pack' ? remainder : assessment.mealEnergyKcal;
    const data = raw[key];
    if (!data || (key === 'balanced_recipes' && MEALS.some(meal => typeof data[meal] !== 'string' || (budgets[meal] > 0 && !data[meal].trim())))) throw new Error('AI未生成完整的多种配餐草稿，请重试');
    variants[key] = Object.fromEntries(MEALS.map(meal => {
      const rendered = key === 'balanced_recipes' ? data[meal].trim() : categoryText(data[meal], budgets[meal]);
      const regular = budgets[meal] > 0 ? rendered : '';
      const content = key === 'meal_pack' && ['breakfast', 'dinner'].includes(meal) ? [PACK_LINE, regular].filter(Boolean).join('\n') : regular;
      return [meal, { content, enabled: assessment.mealEnergyKcal[meal] > 0 }];
    }));
  }
  return { variants, unavailableReason: !remainder ? '早餐和晚餐预算须各不少于200 kcal' : !variants.meal_pack ? String(raw.mealPackUnavailableReason || '餐包适用性需进一步评估').slice(0, 500) : '' };
}
module.exports = { variantPrompt, parseVariants, categoryText };
