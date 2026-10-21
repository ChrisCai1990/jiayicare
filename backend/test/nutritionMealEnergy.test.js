const test = require('node:test');
const assert = require('node:assert/strict');
const { PACK_LINE } = require('../../shared/nutritionMealPlans.cjs');
const { estimateLine, estimateEditedMeals } = require('../../shared/nutritionMealEnergy.cjs');
const assessment = { managementKcal: 1000, mealEnergyKcal: { breakfast: 400, lunch: 300, dinner: 300, snack: 0 } };
test('增减分量、删除行、停用餐次实时改变能量，餐包固定200', () => {
  const modules = { breakfast: { content: PACK_LINE + '\n主食：50 g（生重）' } };
  assert.equal(estimateEditedMeals(modules, assessment).subtotal, 380);
  modules.breakfast.content = PACK_LINE + '\n主食：25 g（生重）';
  assert.equal(estimateEditedMeals(modules, assessment).subtotal, 290);
  modules.breakfast.content = PACK_LINE;
  assert.equal(estimateEditedMeals(modules, assessment).subtotal, 200);
  modules.breakfast.enabled = false;
  assert.equal(estimateEditedMeals(modules, assessment).subtotal, 0);
  assert.equal(estimateLine(PACK_LINE, { [PACK_LINE]: 600 }).kcal, 200);
});
test('不把未知项当0，不把熟重或ml盲目套生重克数，部分小计不算全天差额', () => {
  for (const line of ['主食：100 g（熟重）', '豆制品：100 g（可食部）', '奶制品：250 ml（液体量）', '鸡蛋一个', '蔬菜：-10 g（可食部）']) assert.equal(estimateLine(line).kcal, null);
  const result = estimateEditedMeals({ breakfast: { content: PACK_LINE + '\n鸡蛋一个' } }, assessment);
  assert.equal(result.subtotal, 200);
  assert.equal(result.unknown, 1);
  assert.equal(result.difference, null);
  assert.equal(result.meals.breakfast.difference, null);
});
test('人工核实按完整行保存，分量变化后旧值不冒用，0可明确填写', () => {
  const line = '奶制品：250 ml（液体量）';
  const manual = { breakfast: { [line]: 150 } };
  const result = estimateEditedMeals({ breakfast: { content: line } }, assessment, manual);
  assert.equal(result.subtotal, 150);
  assert.equal(result.difference, -850);
  assert.equal(estimateEditedMeals({ breakfast: { content: line.replace('250', '300') } }, assessment, manual).unknown, 1);
  assert.equal(estimateLine('水', { 水: 0 }).kcal, 0);
  assert.equal(estimateLine('水', { 水: -1 }).kcal, null);
});
