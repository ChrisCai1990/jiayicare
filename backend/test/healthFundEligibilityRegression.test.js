const test = require('node:test');
const assert = require('node:assert/strict');
const { corporateProductEligible } = require('../src/utils/healthFundPayment');

test('category restrictions apply to corporate fund without blocking personal fund settlement', () => {
  assert.equal(corporateProductEligible(
    { eligibleCategories: ['体检服务'] },
    'product-1',
    '营养服务',
    { mode: 'inherit' },
  ), false);
});

test('an explicit product rule takes precedence over inherited platform categories', () => {
  assert.equal(corporateProductEligible(
    { eligibleCategories: ['体检服务'] },
    'product-2',
    '营养服务',
    { mode: 'percentage', value: 5 },
  ), true);
});
