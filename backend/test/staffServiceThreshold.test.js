const test = require('node:test');
const assert = require('node:assert/strict');
const { excess, monthOf, monthEnd, serviceThresholdForCommission } = require('../src/utils/staffServiceThreshold');
const { serviceVolumeEvents } = require('../src/utils/partnerTeamEarning');
const Order = require('../src/models/Order');
const Commission = require('../src/models/Commission');
const StaffServiceThresholdRule = require('../src/models/StaffServiceThresholdRule');

test('monthly service threshold credits only the amount above the floor', () => {
  const threshold = 300000;
  assert.equal(excess(0, 200000, threshold), 0);
  assert.equal(excess(200000, 150000, threshold), 50000);
  assert.equal(excess(350000, 100000, threshold), 100000);
});

test('Shanghai month boundaries handle a UTC time on the prior day', () => {
  assert.equal(monthOf(new Date('2026-10-31T16:30:00Z')), '2026-11');
  assert.equal(monthEnd('2026-11').toISOString(), '2026-11-30T16:00:00.000Z');
});

test('repeated service redemption is split by actual completion time', () => {
  const order = { paidAt: new Date('2026-10-01T00:00:00Z'), paidAmount: 2000,
    refundedAmount: 0, paymentStatus: 'paid', refundStatus: 'none',
    businessAllocationsSnapshot: [{ key: 'care', name: '服务', businessType: 'service',
      teamRole: 'familyDoctor', revenueSharePercent: 100, allocationAmountCents: 200000 }],
    serviceItemsSnapshot: [{ key: 'care', units: 2 }],
    servicePerformers: [{ role: 'familyDoctor', staffId: 'staff-a' }],
    redemptions: [{ sequence: 1, serviceItemKey: 'care', redeemedAt: new Date('2026-10-28T03:00:00Z') },
      { sequence: 2, serviceItemKey: 'care', redeemedAt: new Date('2026-11-03T03:00:00Z') }],
  };
  const events = serviceVolumeEvents(order);
  assert.deepEqual(events.map(row => [monthOf(row.at), row.amountCents]),
    [['2026-10', 100000], ['2026-11', 100000]]);
});

test('cancelled paid order contributes no monthly service volume', () => {
  const events = serviceVolumeEvents({
    paidAt: new Date('2026-11-02T01:00:00Z'), paidAmount: 2000,
    refundedAmount: 0, paymentStatus: 'paid', status: 'cancelled',
    businessAllocationsSnapshot: [{ key: 'care', name: '服务', businessType: 'service',
      teamRole: 'familyDoctor', revenueSharePercent: 100, allocationAmountCents: 200000 }],
    servicePerformers: [{ role: 'familyDoctor', staffId: 'staff-a' }],
    verifiedAt: new Date('2026-11-02T03:00:00Z'), redemptions: [],
  });
  assert.equal(events.reduce((sum, row) => sum + row.amountCents, 0), 0);
});

test('a second completed order earns service fee only on its excess monthly volume', async () => {
  const originalOrderFind = Order.find;
  const originalCommissionFind = Commission.find;
  const originalRuleFind = StaffServiceThresholdRule.findOne;
  const makeOrder = (id, day) => ({ _id: id, tenantId: 'tenant',
    paidAt: new Date(`2026-11-${day}T01:00:00Z`), paidAmount: 2000, refundedAmount: 0,
    paymentStatus: 'paid', refundStatus: 'none',
    businessAllocationsSnapshot: [{ key: 'care', name: '服务', businessType: 'service',
      teamRole: 'familyDoctor', revenueSharePercent: 100, allocationAmountCents: 200000 }],
    servicePerformers: [{ role: 'familyDoctor', staffId: 'staff-a' }],
    verifiedAt: new Date(`2026-11-${day}T03:00:00Z`), redemptions: [],
  });
  const first = makeOrder('order-1', '01');
  const second = makeOrder('order-2', '02');
  try {
    Order.find = () => ({ select: () => ({ lean: () => ({ cursor: async function* () {
      yield first; yield second;
    } }) }) });
    Commission.find = () => ({ select: () => ({ lean: async () => [] }) });
    StaffServiceThresholdRule.findOne = () => ({ sort: () => ({ lean: async () => ({
      _id: 'rule-1', version: 1, thresholdCents: 300000,
    }) }) });
    const result = await serviceThresholdForCommission(second, { role: 'fulfiller',
      tenantId: 'tenant', staffId: 'staff-a', orderId: 'order-2', orderAmount: 2000,
      createdAt: new Date('2026-11-02T03:01:00Z'), redemptionSequence: null,
      serviceItemKey: '' }, new Date('2026-12-03T00:00:00Z'));
    assert.equal(result.totalCents, 200000);
    assert.equal(result.eligibleCents, 100000);
    assert.equal(result.ready, true);
  } finally {
    Order.find = originalOrderFind;
    Commission.find = originalCommissionFind;
    StaffServiceThresholdRule.findOne = originalRuleFind;
  }
});
