const test = require('node:test');
const assert = require('node:assert/strict');
const { maturity, statusFor, tierFinalAt } = require('../src/utils/marketPartnerSettlement');

test('no advance payment when service has not actually started', () => {
  const order = { paidAt: '2026-11-01T00:00:00+08:00', refundStatus: 'none' };
  assert.equal(maturity(order, new Date('2026-12-10T00:00:00+08:00')).firstReady, false);
});

test('first and final release require both service start and elapsed payment windows', () => {
  const order = { paidAt: '2026-11-01T00:00:00+08:00', serviceStartedAt: '2026-11-20T00:00:00+08:00', refundStatus: 'none' };
  assert.equal(maturity(order, new Date('2026-11-19T23:59:59+08:00')).firstReady, false);
  assert.equal(maturity(order, new Date('2026-11-20T00:00:00+08:00')).firstReady, true);
  assert.equal(maturity(order, new Date('2026-11-20T00:00:00+08:00')).finalReady, false);
  assert.equal(maturity(order, new Date('2026-12-01T00:00:00+08:00')).finalReady, true);
  assert.equal(maturity({ ...order, refundStatus: 'processing' }, new Date('2026-12-01T00:00:00+08:00')).finalReady, false);
});

test('refund after payout is an amount to recover, not erasure of prior payout', () => {
  assert.equal(statusFor({ accruedCents: 5000, paidCents: 7000, firstReady: true }), 'reversal_due');
});

test('monthly tier final payment waits until the month has passed its 30-day retention window', () => {
  const order = { paidAt: '2026-11-01T00:00:00+08:00', serviceStartedAt: '2026-11-02T00:00:00+08:00', refundStatus: 'none' };
  const cutoff = tierFinalAt('2026-11');
  assert.equal(maturity(order, new Date(cutoff.getTime() - 1), cutoff).finalReady, false);
  assert.equal(maturity(order, cutoff, cutoff).finalReady, true);
});
