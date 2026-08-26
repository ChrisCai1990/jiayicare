const test = require('node:test');
const assert = require('node:assert/strict');
const { productDeductionLimit } = require('../src/utils/healthFundPayment');

test('product health fund rule supports disabled, full, percentage and fixed limits', () => {
  assert.equal(productDeductionLimit({ mode:'disabled' }, 500), 0);
  assert.equal(productDeductionLimit({ mode:'unlimited' }, 500), 500);
  assert.equal(productDeductionLimit({ mode:'percentage', value:30 }, 500), 150);
  assert.equal(productDeductionLimit({ mode:'fixedAmount', value:80 }, 500), 80);
});

test('legacy products inherit the global order limit', () => {
  assert.equal(productDeductionLimit(undefined, 500), 500);
  assert.equal(productDeductionLimit({ mode:'inherit' }, 500), 500);
});
