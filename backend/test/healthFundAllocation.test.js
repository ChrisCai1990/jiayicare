const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateHealthFund } = require('../src/utils/healthFundPayment');

test('自有基金优先全额抵扣，企业基金单独遵守商品比例', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 2000,
    personalAvailable: 4,
    corporateAvailable: 580,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 4, corporateUsed: 200, allowed: 204 });
});

test('企业基金不再受固定200元缺省上限影响', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 5000,
    personalAvailable: 0,
    corporateAvailable: 1000,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 0, corporateUsed: 500, allowed: 500 });
});

test('企业来源不适用时，自有基金仍可使用', () => {
  assert.deepEqual(allocateHealthFund({
    orderAmount: 2000,
    personalAvailable: 4,
    corporateAvailable: 580,
    corporateEligible: false,
    productRule: { mode: 'percentage', value: 10 },
  }), { personalUsed: 4, corporateUsed: 0, allowed: 4 });
});

test('商品禁用企业赠金时，自有基金仍可全额抵扣', () => {
  assert.deepEqual(allocateHealthFund({ orderAmount: 2000, personalAvailable: 4000,
    corporateAvailable: 4000, productRule: { mode: 'disabled' } }),
  { personalUsed: 2000, corporateUsed: 0, allowed: 2000 });
});
