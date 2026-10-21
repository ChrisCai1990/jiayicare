const { MEALS, PACK_LINE } = require('./nutritionMealPlans.cjs');
const SOURCE = 'https://www.nhc.gov.cn/ewebeditor/uploadfile/2017/08/20170811094322565.pdf';
// WS/T 558-2017 appendix E exchange estimates, not actual recipe composition.
const REFERENCES = {
  杂粮: { per100: 360, bases: ['生重', '干重'], note: '按谷物干料交换份估算' },
  主食: { per100: 360, bases: ['生重', '干重'], note: '按谷物干料交换份；薯类不能直接套用' },
  荤菜: { per100: 180, bases: ['生重', '可食部'], note: '按肉蛋类平均交换份；鱼虾、肥瘦差异需校正' },
  蛋类: { per100: 180, bases: ['生重', '可食部'], note: '按肉蛋类平均交换份估算' },
  蔬菜: { per100: 18, bases: ['生重', '可食部'], note: '按普通蔬菜交换份；高淀粉蔬菜需校正' },
  水果: { per100: 45, bases: ['生重', '可食部'], note: '按水果平均交换份估算' },
  奶制品: { per100: 56.25, bases: ['可食部'], note: '按奶类交换份；奶粉、奶酪不适用' },
  坚果: { per100: 600, bases: ['可食部', '生重'], note: '按去壳坚果交换份估算' },
  油脂: { per100: 900, bases: ['可食部', '生重'], note: '按油脂交换份估算' },
};

function estimateLine(line, manual = {}) {
  if (line === PACK_LINE) return { line, kcal: 200, source: '餐包固定值', note: '每包50 g计200 kcal' };
  const value = manual[line];
  if (value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10000) {
    return { line, kcal: Number(value), source: '营养师填写', note: '本行总能量；文字或分量变化后需重新核实' };
  }
  const match = line.match(/^([^：:]+)[：:]\s*(\d+(?:\.\d+)?)\s*(g|克|ml|毫升)\s*[（(](生重|干重|熟重|可食部|液体量)[）)]$/i);
  if (match) {
    const [, name, amount, unit, basis] = match;
    const reference = REFERENCES[name.trim()];
    if (Number(amount) > 0 && Number(amount) <= 3000 && reference && ['g', '克'].includes(unit) && reference.bases.includes(basis)) {
      return { line, kcal: Number(amount) * reference.per100 / 100, source: '交换份估算', note: reference.note };
    }
  }
  return { line, kcal: null, source: '待核实', note: '缺少可用食物系数或称重口径，请核实本行能量；不按0计算' };
}

function estimateEditedMeals(modules = {}, assessment = {}, manual = {}) {
  const meals = Object.fromEntries(MEALS.map(key => {
    const data = modules[key] || {};
    const lines = data.enabled === false ? [] : String(data.content || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const rows = lines.map(line => estimateLine(line, manual[key] || {}));
    const subtotal = rows.reduce((sum, row) => sum + (row.kcal ?? 0), 0);
    const unknown = rows.filter(row => row.kcal === null).length;
    const target = Number.isFinite(assessment.mealEnergyKcal?.[key]) ? assessment.mealEnergyKcal[key] : null;
    return [key, { rows, subtotal: Math.round(subtotal), unknown, target,
      difference: !unknown && target !== null ? Math.round(subtotal - target) : null }];
  }));
  const unknown = Object.values(meals).reduce((sum, meal) => sum + meal.unknown, 0);
  const subtotal = Object.values(meals).reduce((sum, meal) => sum + meal.subtotal, 0);
  const target = Number(assessment.managementKcal) || null;
  return { version: 1, meals, subtotal, unknown, target, difference: !unknown && target !== null ? subtotal - target : null };
}
module.exports = { SOURCE, REFERENCES, estimateLine, estimateEditedMeals };
