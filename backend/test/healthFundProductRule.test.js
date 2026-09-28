const test = require('node:test');
const assert = require('node:assert/strict');
const { productDeductionLimit } = require('../src/utils/healthFundPayment');

test('product fund rules cap all sources at twenty percent', () => {
  assert.equal(productDeductionLimit({ mode:'disabled' }, 500), 0);
  assert.equal(productDeductionLimit({ mode:'unlimited' }, 500), 100);
  assert.equal(productDeductionLimit({ mode:'percentage', value:30 }, 500), 100);
  assert.equal(productDeductionLimit({ mode:'fixedAmount', value:80 }, 500), 80);
  assert.equal(productDeductionLimit({ mode:'fixedAmount', value:150 }, 500), 100);
  assert.equal(productDeductionLimit({ mode:'percentage', value:5 }, 500), 25);
});

test('unconfigured products inherit the twenty-percent platform cap', () => {
  assert.equal(productDeductionLimit(undefined, 500), 100);
  assert.equal(productDeductionLimit({ mode:'inherit' }, 500), 100);
});
