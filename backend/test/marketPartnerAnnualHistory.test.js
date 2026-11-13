const test = require('node:test');
const assert = require('node:assert/strict');
const { annualPeriodNumber } = require('../src/utils/marketPartnerSettlement');
const { rateFor, POLICIES } = require('../src/utils/partnerCommissionPolicy');

test('annual commission waits for reviewed historical paid years', () => {
  assert.equal(annualPeriodNumber(null, 0), null);
  assert.equal(annualPeriodNumber({ priorPaidPeriods: 0 }, 0), 1);
  assert.equal(annualPeriodNumber({ priorPaidPeriods: 1 }, 0), 2);
});

test('historical paid years continue through year five and then stop', () => {
  const yearFive = annualPeriodNumber({ priorPaidPeriods: 3 }, 1);
  const yearSix = annualPeriodNumber({ priorPaidPeriods: 3 }, 2);
  assert.equal(rateFor({ policy: POLICIES.consumer365, periodNumber: yearFive }), 500);
  assert.equal(rateFor({ policy: POLICIES.consumer365, periodNumber: yearSix }), 0);
});
