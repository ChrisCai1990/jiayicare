const test = require('node:test');
const assert = require('node:assert/strict');
const { maxFundDeduction, maxGroupFundDeduction } = require('../src/utils/healthFundPreview');
const fund = { eligible: true, personal: 1000, corporate: 0 };
const product = (mode, value) => ({ healthFundDeduction: { mode, value } });

test('explicit product rules can exceed default 20 percent without exceeding price', () => {
  assert.equal(maxFundDeduction(fund, 100, product('percentage', 30)), 30);
  assert.equal(maxFundDeduction(fund, 100, product('fixedAmount', 50)), 50);
  assert.equal(maxFundDeduction(fund, 100, product('fixedAmount', 200)), 100);
});
test('default rules, disabled access and balances still constrain estimates', () => {
  for (const mode of [undefined, 'inherit', 'unlimited']) {
    assert.equal(maxFundDeduction(fund, 100, product(mode)), 20);
  }
  assert.equal(maxFundDeduction(fund, 100, product('disabled')), 0);
  assert.equal(maxFundDeduction({ ...fund, eligible: false }, 100, product('percentage', 30)), 0);
  assert.equal(maxFundDeduction({ ...fund, personal: 7 }, 100, product('percentage', 30)), 7);
});
test('group coupon allocation applies explicit rules to discounted amounts', () => {
  const products = [
    { price: 100, fundProduct: product('percentage', 30) },
    { price: 100, fundProduct: product('fixedAmount', 50) },
  ];
  assert.equal(maxGroupFundDeduction(fund, 180, products), 77);
  assert.equal(maxGroupFundDeduction({ ...fund, personal: 20 }, 180, products), 20);
});
