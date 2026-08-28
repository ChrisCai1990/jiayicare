const test = require('node:test');
const assert = require('node:assert/strict');
const { INTENSIVE_NUTRITION_WEEKS, intensiveNutritionCheckpoint } = require('../src/utils/phaseAssessmentScheduler');

test('强化营养干预评估节点固定为前4周每周、后8周每2周', () => {
  assert.deepEqual(INTENSIVE_NUTRITION_WEEKS, [1, 2, 3, 4, 6, 8, 10, 12]);
  assert.equal(intensiveNutritionCheckpoint(5), 4);
  assert.equal(intensiveNutritionCheckpoint(9), 8);
  assert.equal(intensiveNutritionCheckpoint(12), 12);
});
