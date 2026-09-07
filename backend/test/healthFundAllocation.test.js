const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateHealthFund } = require('../src/utils/healthFundPayment');

test('先用自有基金，再以剩余金额计算企业基金比例', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 2000,
    personalAvailable: 4,
    corporateAvailable: 580,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 4, corporateUsed: 199.6, allowed: 203.6 });
});

test('企业基金不再受固定200元缺省上限影响', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 5000,
    personalAvailable: 0,
    corporateAvailable: 1000,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 0, corporateUsed: 500, allowed: 500 });
});

test('禁用商品只允许使用自有基金', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 2000,
    personalAvailable: 4,
    corporateAvailable: 580,
    corporateEligible: false,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 4, corporateUsed: 0, allowed: 4 });
});
