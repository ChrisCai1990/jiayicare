const test = require('node:test');
const assert = require('node:assert/strict');
const { POLICIES, commissionCents, adjustmentCents } = require('../src/utils/partnerCommissionPolicy');

test('365 annual renewals stop after five paid service periods', () => {
  assert.deepEqual([1, 2, 3, 5, 6].map(periodNumber => commissionCents({ paidCents: 36500,
    policy: POLICIES.consumer365, periodNumber }).totalCents), [7300, 3650, 1825, 1825, 0]);
});

test('monthly tiers apply to every eligible first-year order and online/offline count together', () => {
  assert.equal(commissionCents({ paidCents: 1580000, policy: POLICIES.annualAdvisor,
    monthlyQualifiedCount: 4 }).baseCents, 316000);
  assert.equal(commissionCents({ paidCents: 1580000, policy: POLICIES.annualAdvisor,
    monthlyQualifiedCount: 1 }).baseCents, 158000);
  assert.equal(adjustmentCents(158000, 316000), 158000);
});

test('single-visit referral requires direct contribution; repeated assessment remains 10 percent', () => {
  assert.equal(commissionCents({ paidCents: 38000, policy: POLICIES.medicalAssist }).totalCents, 0);
  assert.equal(commissionCents({ paidCents: 38000, policy: POLICIES.medicalAssist,
    directReferral: true }).totalCents, 5700);
  assert.equal(commissionCents({ paidCents: 68000, policy: POLICIES.assessment,
    periodNumber: 3 }).totalCents, 6800);
});

test('each purchase can use a separately configured repeat referral rate', () => {
  const policy = { kind: 'every', first: 1500, repeat: 800 };
  assert.equal(commissionCents({ paidCents: 10000, policy, periodNumber: 1 }).totalCents, 1500);
  assert.equal(commissionCents({ paidCents: 10000, policy, periodNumber: 2 }).totalCents, 800);
  assert.equal(commissionCents({ paidCents: 10000,
    policy: { kind: 'every', first: 1500 }, periodNumber: 2 }).totalCents, 1500);
});

test('quick-close reward includes day seven, excludes day eight, and never applies to renewals', () => {
  const firstConversationAt = '2026-11-01T00:00:00+08:00';
  const base = { paidCents: 12000000, policy: POLICIES.weightManagement, firstConversationAt };
  assert.equal(commissionCents({ ...base, paidAt: '2026-11-08T23:59:59+08:00' }).quickCloseCents, 100000);
  assert.equal(commissionCents({ ...base, paidAt: '2026-11-09T00:00:00+08:00' }).quickCloseCents, 0);
  assert.equal(commissionCents({ ...base, paidAt: '2026-11-02T00:00:00+08:00', periodNumber: 2 }).quickCloseCents, 0);
});

test('partial refund recomputes from retained cash and yields a signed correction', () => {
  const before = commissionCents({ paidCents: 100001, policy: POLICIES.consumer365 }).totalCents;
  const after = commissionCents({ paidCents: 60001, policy: POLICIES.consumer365 }).totalCents;
  assert.equal(adjustmentCents(before, after), -8000);
});
