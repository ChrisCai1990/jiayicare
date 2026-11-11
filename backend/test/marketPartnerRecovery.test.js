const test = require('node:test');
const assert = require('node:assert/strict');
const { statusFor } = require('../src/utils/marketPartnerSettlement');
const { statusAfterAdjustment } = require('../src/utils/teamIncentiveSettlement');

test('partner refund keeps paid fact and marks excess for recovery', () => {
  assert.equal(statusFor({ accruedCents: 5000, paidCents: 10000, firstReady: true }), 'reversal_due');
  assert.equal(statusFor({ accruedCents: 5000, paidCents: 10000 - 5000, firstReady: true }), 'paid');
});

test('team payment is reviewed again when a partial refund changes the amount', () => {
  assert.equal(statusAfterAdjustment({ status: 'confirmed', paidCents: 0, recoveredCents: 0 }, 3000), 'pending');
  assert.equal(statusAfterAdjustment({ status: 'paid', paidCents: 5000, recoveredCents: 0 }, 3000), 'reversal_due');
  assert.equal(statusAfterAdjustment({ status: 'reversal_due', paidCents: 5000, recoveredCents: 2000 }, 3000), 'paid');
  assert.equal(statusAfterAdjustment({ status: 'paid', paidCents: 5000, recoveredCents: 5000 }, 0), 'cancelled');
});
