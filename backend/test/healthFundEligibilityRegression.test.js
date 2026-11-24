const test = require('node:test');
const assert = require('node:assert/strict');
const { corporateProductEligible } = require('../src/utils/healthFundPayment');

test('unconfigured product has no gift fund eligibility', () => {
  assert.equal(corporateProductEligible(
    { eligibleCategories: ['体检服务'] },
    'product-1',
    '营养服务',
    { mode: 'inherit' },
  ), false);
});

test('an explicitly configured product is eligible regardless of the display filter', () => {
  assert.equal(corporateProductEligible(
    { eligibleCategories: ['体检服务'] },
    'product-2',
    '营养服务',
    { mode: 'percentage', value: 5 },
  ), true);
});
