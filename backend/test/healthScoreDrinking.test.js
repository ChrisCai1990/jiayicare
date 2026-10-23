const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateHealthScore } = require('../src/utils/healthScore');

test('drinking frequency maps to the intended lifestyle deduction', () => {
  const cases = [
    ['不喝酒', 0],
    ['几乎不喝酒', 0],
    ['＜1天/周', 0],
    ['<1天/周', 0],
    ['1-3天/周', -3],
    ['3天/周及以上', -6],
    ['每天喝', -6],
  ];

  for (const [drinkingFrequency, expected] of cases) {
    const score = calculateHealthScore({ lifestyle_data: { drinkingFrequency, exerciseFrequency: '3-5天/周', exerciseDuration: '30' } });
    assert.equal(score.deductions.lifestyle, expected, drinkingFrequency);
    assert.equal(score.lifestyleBreakdown.find(item => item.label === '饮酒')?.points || 0, expected, drinkingFrequency);
  }
});
