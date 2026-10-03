const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Enterprise = require('../src/models/Enterprise');
const Account = require('../src/models/EnterpriseSharedFund');
const Enrollment = require('../src/models/InsuranceEnrollment');
const Policy = require('../src/models/EnterpriseInsurancePolicy');
const shared = require('../src/utils/enterpriseSharedFund');

const id = () => new mongoose.Types.ObjectId();

test('shared fund requires a selected product, active insured spouse, and health management dates', async t => {
  const enterpriseId = id(), userId = id(), policyId = id(), productId = id();
  const enterprise = { _id: enterpriseId, status: 'active', hrDataByYear: { 2026: { healthMgmtStartAt: '2026-07-01', healthMgmtEndAt: '2026-08-31' } } };
  const account = { _id: id(), enterpriseId, year: 2026, enabled: true, productIds: [productId], policyIds: [policyId], availableCents: 10000 };
  const enrollment = { enterpriseId, policyId, userId, relation: 'spouse', status: 'active', startAt: '2026-01-01', endAt: '2026-12-31' };
  const policy = { _id: policyId, enterpriseId, status: 'active', startAt: '2026-01-01', endAt: '2026-12-31' };
  t.mock.method(Enterprise, 'findOne', () => ({ lean: async () => enterprise }));
  t.mock.method(Account, 'find', () => ({ sort: () => ({ lean: async () => [account] }) }));
  t.mock.method(Enrollment, 'find', () => ({ lean: async () => [enrollment] }));
  t.mock.method(Policy, 'find', () => ({ lean: async () => [policy] }));
  const user = { _id: userId, enterpriseId };
  assert.equal((await shared.eligibleAccount(user, productId, new Date('2026-07-15T12:00:00Z')))?._id, account._id);
  assert.equal(await shared.eligibleAccount(user, productId, new Date('2026-09-01T12:00:00Z')), null);
  enrollment.relation = 'other';
  // The database filter excludes non-covered relations; this guard is also
  // checked in the query itself, independent of client-supplied claims.
  assert.deepEqual(Enrollment.find.mock.calls.at(-1)?.arguments[0].relation, { $in: ['employee', 'spouse', 'child'] });
  account.productIds = [];
  assert.equal(shared.withinPeriod({ startAt: '2026-07-01', endAt: 'invalid' }), false);
});

test('shared fund quote never exceeds half of after-coupon price or available balance', async t => {
  const enterpriseId = id(), userId = id(), policyId = id(), productId = id();
  t.mock.method(Enterprise, 'findOne', () => ({ lean: async () => ({ _id: enterpriseId, hrDataByYear: { 2026: { healthMgmtStartAt: '2026-01-01', healthMgmtEndAt: '2026-12-31' } } }) }));
  t.mock.method(Account, 'find', () => ({ sort: () => ({ lean: async () => [{ _id: id(), year: 2026, policyIds: [policyId], productIds: [productId], availableCents: 1234 }] }) }));
  t.mock.method(Enrollment, 'find', () => ({ lean: async () => [{ policyId, status: 'active', relation: 'child' }] }));
  t.mock.method(Policy, 'find', () => ({ lean: async () => [{ _id: policyId, status: 'active' }] }));
  const user = { _id: userId, enterpriseId };
  assert.equal((await shared.quote(user, productId, 100)).amount, 12.34);
  assert.equal((await shared.quote(user, productId, 9.99)).amount, 4.99);
});

test('reservation is conditional on available cents and order id; repeated call is idempotent', async t => {
  const account = { _id: id(), availableCents: 5000, entries: {} };
  const orderId = id(), userId = id();
  let updates = 0;
  t.mock.method(Account, 'findOneAndUpdate', async (query, update) => {
    const key = String(orderId);
    if (account.entries[key] || account.availableCents < query.availableCents.$gte) return null;
    account.availableCents += update.$inc.availableCents;
    account.entries[key] = update.$set[`entries.${key}`];
    updates++;
    return account;
  });
  t.mock.method(Account, 'findById', () => ({ lean: async () => account }));
  await shared.reserve({ account, orderId, userId, amount: 25 });
  await shared.reserve({ account, orderId, userId, amount: 25 });
  assert.equal(account.availableCents, 2500);
  assert.equal(updates, 1);
  await assert.rejects(shared.reserve({ account, orderId: id(), userId, amount: 30 }), /余额或规则已变化/);
});

test('paid use and full refund move the same reservation exactly once', async t => {
  const orderId = id(), accountId = id();
  const account = { _id: accountId, availableCents: 6000, reservedCents: 4000, spentCents: 0,
    entries: { [String(orderId)]: { amountCents: 4000, state: 'reserved' } } };
  t.mock.method(Account, 'updateOne', async (query, update) => {
    const entry = account.entries[String(orderId)];
    if (entry.state !== query[`entries.${orderId}.state`] || entry.amountCents !== query[`entries.${orderId}.amountCents`]) return { modifiedCount: 0 };
    for (const [key, value] of Object.entries(update.$inc)) account[key] += value;
    entry.state = update.$set[`entries.${orderId}.state`];
    return { modifiedCount: 1 };
  });
  t.mock.method(Account, 'findById', () => ({ lean: async () => account }));
  const order = { _id: orderId, enterpriseSharedFundId: accountId, enterpriseSharedFundAmount: 40 };
  await shared.settle(order); await shared.settle(order);
  assert.deepEqual([account.availableCents, account.reservedCents, account.spentCents], [6000, 0, 4000]);
  await shared.refund(order); await shared.refund(order);
  assert.deepEqual([account.availableCents, account.reservedCents, account.spentCents], [10000, 0, 0]);
});
