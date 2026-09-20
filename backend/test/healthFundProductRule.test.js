const test = require('node:test');
const assert = require('node:assert/strict');
const { productDeductionLimit } = require('../src/utils/healthFundPayment');

test('product enterprise fund rules are always capped at ten percent', () => {
  assert.equal(productDeductionLimit({ mode:'disabled' }, 500), 0);
  assert.equal(productDeductionLimit({ mode:'unlimited' }, 500), 50);
  assert.equal(productDeductionLimit({ mode:'percentage', value:30 }, 500), 50);
  assert.equal(productDeductionLimit({ mode:'fixedAmount', value:80 }, 500), 50);
  assert.equal(productDeductionLimit({ mode:'percentage', value:5 }, 500), 25);
});

test('unconfigured products inherit the safe ten-percent enterprise-fund cap', () => {
  assert.equal(productDeductionLimit(undefined, 500), 50);
  assert.equal(productDeductionLimit({ mode:'inherit' }, 500), 50);
});
