const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateHealthFund } = require('../src/utils/healthFundPayment');

test('自有基金优先，奖励基金比例作用于剩余金额', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 2000,
    personalAvailable: 4,
    corporateAvailable: 580,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 4, vitalityUsed: 0, corporateUsed: 199.6, allowed: 203.6 });
});

test('企业基金不再受固定200元缺省上限影响', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 5000,
    personalAvailable: 0,
    corporateAvailable: 1000,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 0, vitalityUsed: 0, corporateUsed: 500, allowed: 500 });
});

test('奖励基金不适用时，自有基金仍可抵扣', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 2000,
    personalAvailable: 4,
    corporateAvailable: 580,
    corporateEligible: false,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 4, vitalityUsed: 0, corporateUsed: 0, allowed: 4 });
});

test('自有和活力基金可全额抵扣到0元，奖励基金仍按余额抵扣', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 100, personalAvailable: 40, vitalityAvailable: 60,
    corporateAvailable: 500, corporateEligible: false, productRule: { mode: 'disabled' },
  }), { personalUsed: 40, vitalityUsed: 60, corporateUsed: 0, allowed: 100 });
});

test('奖励基金只对自有和活力抵扣后的余额应用商品比例', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 100, personalAvailable: 30, vitalityAvailable: 20,
    corporateAvailable: 100, productRule: { mode: 'percentage', value: 20 },
  }), { personalUsed: 30, vitalityUsed: 20, corporateUsed: 10, allowed: 60 });
});

test('商品禁用奖励基金时自有和活力仍可抵扣', () => {
  assert.deepEqual(allocateHealthFund({ orderAmount: 2000, personalAvailable: 1000, vitalityAvailable: 1000,
    corporateAvailable: 4000, productRule: { mode: 'disabled' } }),
  { personalUsed: 1000, vitalityUsed: 1000, corporateUsed: 0, allowed: 2000 });
});
