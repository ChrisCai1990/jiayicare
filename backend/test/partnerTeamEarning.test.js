const test = require('node:test');
const assert = require('node:assert/strict');
const { deliveredServiceShares, amountFor, statusFor } = require('../src/utils/partnerTeamEarning');

const base = () => ({ paidAt: new Date('2026-11-01T02:00:00Z'), paidAmount: 5000,
  refundedAmount: 1000, paymentStatus: 'paid', refundStatus: 'partially_refunded',
  verifiedAt: new Date('2026-11-05T02:00:00Z'),
  businessAllocationsSnapshot: [
    { key: 'advisor', name: '顾问服务', businessType: 'service', teamRole: 'familyDoctor',
      revenueSharePercent: 60, allocationAmountCents: 300000 },
    { key: 'manager', name: '健管服务', businessType: 'service', teamRole: 'healthManager',
      revenueSharePercent: 40, allocationAmountCents: 200000 },
  ],
  servicePerformers: [{ role: 'familyDoctor', staffId: 'staff-a' },
    { role: 'healthManager', staffId: 'staff-b' }],
});

test('service business uses verified named performers and refund-adjusted allocation even without personal service fees', () => {
  const shares = deliveredServiceShares(base());
  assert.deepEqual(shares.map(row => [row.staffId, row.basisCents, row.originalBasisCents]),
    [['staff-a', 240000, 300000], ['staff-b', 160000, 200000]]);
  assert.equal(amountFor({ calculationType: 'percentage', basisPoints: 500 }, shares[0].basisCents,
    shares[0].originalBasisCents), 12000);
  assert.equal(amountFor({ calculationType: 'fixedAmount', amountCents: 10000 }, shares[0].basisCents,
    shares[0].originalBasisCents), 8000);
});

test('unverified assignments do not count as completed employee service', () => {
  assert.deepEqual(deliveredServiceShares({ ...base(), verifiedAt: null, redemptions: [] }), []);
});

test('completed service without a redemption uses its completion record', () => {
  const order = { ...base(), verifiedAt: null, redemptions: [], completedAt: new Date('2026-11-06T02:00:00Z') };
  assert.equal(deliveredServiceShares(order).reduce((sum, item) => sum + item.basisCents, 0), 400000);
});

test('a partial redemption credits only completed service volume and fixed leader amount', () => {
  const order = { ...base(), refundedAmount: 0,
    serviceItemsSnapshot: [{ key: 'advisor', units: 2 }, { key: 'manager', units: 2 }],
    redemptions: [{ serviceItemKey: 'advisor', redeemedAt: new Date('2026-11-05T02:00:00Z') }] };
  const shares = deliveredServiceShares(order);
  assert.deepEqual(shares.map(row => [row.staffId, row.basisCents]), [['staff-a', 150000]]);
  assert.equal(amountFor({ calculationType: 'fixedAmount', amountCents: 10000 },
    shares[0].basisCents, shares[0].originalBasisCents), 5000);
});

test('full refund reverses leader earning without removing the audit record', () => {
  const shares = deliveredServiceShares({ ...base(), refundedAmount: 5000,
    paymentStatus: 'refunded', refundStatus: 'refunded' });
  assert.equal(shares[0].basisCents, 0);
  assert.equal(amountFor({ calculationType: 'fixedAmount', amountCents: 10000 },
    shares[0].basisCents, shares[0].originalBasisCents), 0);
  assert.equal(statusFor('paid', 0, 8000, 0), 'reversal_due');
});
