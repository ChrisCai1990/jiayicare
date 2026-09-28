const test = require('node:test');
const assert = require('node:assert/strict');
const { maxFundDeduction } = require('../src/utils/healthFundCheckout');

test('personal fund remains usable outside the corporate product range', () => {
  assert.equal(maxFundDeduction({
    eligible: true, personal: 4,
    corporate: 580,
    policy: { eligibleProductIds: ['another-product'], corporateDeductionType: 'fixedAmount', corporateDeductionValue: 200 },
    rule: { enabled: true },
  }, 20, { id: 'medical-assist', category: '就医协助', healthFundDeduction: { mode: 'inherit' } }), 4);
});

test('disabled product rejects both personal and corporate fund', () => {
  assert.equal(maxFundDeduction({ eligible: true, personal: 4, corporate: 580, policy: {}, rule: { enabled: true } }, 20, {
    id: 'medical-assist', healthFundDeduction: { mode: 'disabled' },
  }), 0);
});

test('all sources share the product fixed-amount cap', () => {
  assert.equal(maxFundDeduction({
    eligible: true, personal: 4,
    corporate: 580,
    policy: { corporateDeductionType: 'fixedAmount', corporateDeductionValue: 1 },
    rule: { enabled: true },
  }, 20, { id: 'medical-assist', healthFundDeduction: { mode: 'fixedAmount', value: 2 } }), 2);
});

test('personal and corporate fund share the product percentage cap', () => {
  assert.equal(maxFundDeduction({
    eligible: true, personal: 4,
    corporate: 580,
    policy: { corporateDeductionType: 'fixedAmount', corporateDeductionValue: 200 },
    rule: { enabled: true },
  }, 2000, { id: 'checkup', healthFundDeduction: { mode: 'percentage', value: 10 } }), 200);
});
