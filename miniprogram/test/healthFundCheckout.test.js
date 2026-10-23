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

test('disabled product still allows personal fund', () => {
  assert.equal(maxFundDeduction({ eligible: true, personal: 4, corporate: 580, policy: {}, rule: { enabled: true } }, 20, {
    id: 'medical-assist', healthFundDeduction: { mode: 'disabled' },
  }), 4);
});

test('product fixed-amount cap applies only to reward fund', () => {
  assert.equal(maxFundDeduction({
    eligible: true, personal: 4,
    corporate: 580,
    policy: { corporateDeductionType: 'fixedAmount', corporateDeductionValue: 1 },
    rule: { enabled: true },
  }, 20, { id: 'medical-assist', healthFundDeduction: { mode: 'fixedAmount', value: 2 } }), 6);
});

test('personal fund precedes reward percentage cap', () => {
  assert.equal(maxFundDeduction({
    eligible: true, personal: 4,
    corporate: 580,
    policy: { corporateDeductionType: 'fixedAmount', corporateDeductionValue: 200 },
    rule: { enabled: true },
  }, 2000, { id: 'checkup', healthFundDeduction: { mode: 'percentage', value: 10 } }), 204);
});

test('vitality can cover the full balance even when reward fund is disabled', () => {
  assert.equal(maxFundDeduction({ personal: 4, vitality: 16, corporate: 200, policy: {}, rule: { enabled: true } }, 20, {
    id: 'checkup', healthFundDeduction: { mode: 'disabled' },
  }), 20);
});
