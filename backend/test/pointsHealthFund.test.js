const test = require('node:test');
const assert = require('node:assert/strict');
const { POINTS_PER_YUAN, conversionFor } = require('../src/utils/pointsHealthFund');

test('100 points exchange for one yuan health fund', () => {
  assert.equal(POINTS_PER_YUAN, 100);
  assert.deepEqual(conversionFor(95, 5), { pointsBalance: 0, redeemedPoints: 100, fundAmount: 1 });
});

test('conversion keeps points below the next complete hundred', () => {
  assert.deepEqual(conversionFor(198, 5), { pointsBalance: 3, redeemedPoints: 200, fundAmount: 2 });
  assert.deepEqual(conversionFor(20, 5), { pointsBalance: 25, redeemedPoints: 0, fundAmount: 0 });
});

test('legacy staff-managed points are included once during migration', () => {
  assert.deepEqual(conversionFor(45, 5, 50), { pointsBalance: 0, redeemedPoints: 100, fundAmount: 1 });
});
