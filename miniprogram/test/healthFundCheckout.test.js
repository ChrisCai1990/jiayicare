const test = require('node:test');
const assert = require('node:assert/strict');
const { maxFundDeduction } = require('../src/utils/healthFundCheckout');

test('personal fund remains usable outside the corporate product range', () => {
  assert.equal(maxFundDeduction({
    personal: 4,
    corporate: 580,
    policy: { eligibleProductIds: ['another-product'], corporateDeductionType: 'fixedAmount', corporateDeductionValue: 200 },
    rule: { enabled: true },
  }, 20, { id: 'medical-assist', category: '就医协助', healthFundDeduction: { mode: 'inherit' } }), 4);
});

test('disabling corporate fund on a product does not disable personal fund', () => {
  assert.equal(maxFundDeduction({ personal: 4, corporate: 580, policy: {}, rule: { enabled: true } }, 20, {
    id: 'medical-assist', healthFundDeduction: { mode: 'disabled' },
  }), 4);
});

test('corporate limits never cap the personal portion', () => {
  assert.equal(maxFundDeduction({
    personal: 4,
    corporate: 580,
    policy: { corporateDeductionType: 'fixedAmount', corporateDeductionValue: 1 },
    rule: { enabled: true },
  }, 20, { id: 'medical-assist', healthFundDeduction: { mode: 'fixedAmount', value: 2 } }), 6);
});

test('uses personal fund first and applies product percentage to the remaining amount', () => {
  assert.equal(maxFundDeduction({
    personal: 4,
    corporate: 580,
    policy: { corporateDeductionType: 'fixedAmount', corporateDeductionValue: 200 },
    rule: { enabled: true },
  }, 2000, { id: 'checkup', healthFundDeduction: { mode: 'percentage', value: 10 } }), 203.6);
});
