const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateHealthFund } = require('../src/utils/healthFundPayment');

test('自有基金优先，两类基金合计不超过商品比例上限', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 2000,
    personalAvailable: 4,
    corporateAvailable: 580,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 4, corporateUsed: 196, allowed: 200 });
});

test('企业基金不再受固定200元缺省上限影响', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 5000,
    personalAvailable: 0,
    corporateAvailable: 1000,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 0, corporateUsed: 500, allowed: 500 });
});

test('企业来源不适用时，自有基金仍受商品上限约束', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 2000,
    personalAvailable: 4,
    corporateAvailable: 580,
    corporateEligible: false,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 4, corporateUsed: 0, allowed: 4 });
});

test('商品禁用基金时两类余额都不能抵扣', () => {
  assert.deepEqual(allocateHealthFund({ orderAmount: 2000, personalAvailable: 4000,
    corporateAvailable: 4000, productRule: { mode: 'disabled' } }),
  { personalUsed: 0, corporateUsed: 0, allowed: 0 });
});
