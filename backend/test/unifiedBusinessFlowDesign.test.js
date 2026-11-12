// Synthetic business walkthrough for the approved design. No production data or database writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { commissionCents, POLICIES } = require('../src/utils/partnerCommissionPolicy');
const { teamIncentiveCents } = require('../src/utils/teamIncentivePolicy');
const { allocations, unitBasis } = require('../src/utils/serviceItemIncentiveBasis');

const rate = basisPoints => ({ kind: 'every', first: basisPoints });
const net = order => order.paidCents - order.refundedCents;

test('enterprise cash is counted once while partner, staff and service credits remain separate', () => {
  const orders = [
    { id: 'A', paidCents: 36500, refundedCents: 0, source: 'partner', partner: '甲' },
    { id: 'B', paidCents: 1000000, refundedCents: 200000, source: 'partner', partner: '乙' },
    { id: 'C', paidCents: 200000, refundedCents: 0, source: 'staff', staff: '丙' },
    { id: 'D', paidCents: 50000, refundedCents: 0, source: 'unassigned' },
    { id: 'E', paidCents: 0, refundedCents: 0, source: 'unassigned', entitlementUse: true },
  ];
  const cash = orders.reduce((sum, order) => sum + order.paidCents, 0);
  const refunded = orders.reduce((sum, order) => sum + order.refundedCents, 0);
  const netCash = orders.reduce((sum, order) => sum + net(order), 0);
  const sources = Object.fromEntries(['partner', 'staff', 'unassigned'].map(source =>
    [source, orders.filter(order => order.source === source).reduce((sum, order) => sum + net(order), 0)]));
  assert.deepEqual({ cash, refunded, netCash, sources }, {
    cash: 1286500, refunded: 200000, netCash: 1086500,
    sources: { partner: 836500, staff: 200000, unassigned: 50000 },
  });
  assert.equal(Object.values(sources).reduce((sum, value) => sum + value, 0), netCash);

  const externalA = commissionCents({ paidCents: net(orders[0]), policy: POLICIES.consumer365 }).totalCents;
  const externalB = commissionCents({ paidCents: net(orders[1]), policy: rate(1000) }).totalCents;
  const internalC = commissionCents({ paidCents: net(orders[2]), policy: rate(800) }).totalCents;
  const modules = [
    { role: 'familyDoctor', share: 50, amount: 400000 },
    { role: 'nutritionist', share: 30, amount: 240000 },
    { role: 'healthManager', share: 20, amount: 160000 },
  ];
  assert.equal(modules.reduce((sum, item) => sum + item.share, 0), 100);
  assert.equal(modules.reduce((sum, item) => sum + item.amount, 0), net(orders[1]));
  const moduleIncentives = modules.map(item => teamIncentiveCents({ role: item.role,
    ruleType: 'percentage', basisCents: item.amount, basisPoints: 500 }));
  const nutritionC = teamIncentiveCents({ role: 'nutritionist', ruleType: 'percentage',
    basisCents: net(orders[2]), basisPoints: 500 });
  assert.deepEqual({ externalA, externalB, internalC, moduleIncentives, nutritionC }, {
    externalA: 7300, externalB: 80000, internalC: 16000,
    moduleIncentives: [20000, 12000, 8000], nutritionC: 10000,
  });
  const allIncentives = externalA + externalB + internalC
    + moduleIncentives.reduce((sum, value) => sum + value, 0) + nutritionC;
  const directCosts = 300000, transactionCosts = 10500;
  assert.equal(allIncentives, 153300);
  assert.equal(netCash - allIncentives - directCosts - transactionCosts, 622700);
});

test('365 renewal years and a post-payment refund produce the expected adjustments', () => {
  const years = [1, 2, 3, 4, 5, 6].map(periodNumber => commissionCents({
    paidCents: 36500, policy: POLICIES.consumer365, periodNumber,
  }).totalCents);
  assert.deepEqual(years, [7300, 3650, 1825, 1825, 1825, 0]);

  const originalPaidPartnerCents = 50000;
  const afterMoreRefundNetCents = 400000;
  const recomputedPartnerCents = commissionCents({ paidCents: afterMoreRefundNetCents,
    policy: rate(1000) }).totalCents;
  assert.equal(recomputedPartnerCents, 40000);
  assert.equal(Math.max(0, originalPaidPartnerCents - recomputedPartnerCents), 10000);
});

test('combination child items and repeated units keep the cash allocation exact', () => {
  const first = { _id: 'r1', sequence: 1, serviceItemKey: 'nutrition' };
  const second = { _id: 'r2', sequence: 2, serviceItemKey: 'nutrition' };
  const order = { serviceItemsSnapshot: [
    { key: 'doctor', name: '顾问服务', childProductId: 'p1', teamRole: 'familyDoctor', revenueSharePercent: 60, units: 1 },
    { key: 'nutrition', name: '营养服务', childProductId: 'p2', teamRole: 'nutritionist', revenueSharePercent: 40, units: 2 },
  ], redemptions: [first, second] };
  assert.deepEqual(allocations(order, 8005).map(item => item.amountCents), [4803, 3202]);
  assert.equal(unitBasis(order, 8005, 'nutrition', first._id).basisCents, 1601);
  assert.equal(unitBasis(order, 8005, 'nutrition', second._id).basisCents, 1601);
  assert.deepEqual(allocations(order, 6005).map(item => item.amountCents), [3603, 2402]);
  assert.equal(unitBasis(order, 6005, 'nutrition', first._id).basisCents, 1201);
  assert.equal(unitBasis(order, 6005, 'nutrition', second._id).basisCents, 1201);
  assert.equal(unitBasis(order, 8005, 'doctor', second._id), null);
});
