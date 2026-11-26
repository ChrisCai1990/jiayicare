const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function harness({ status = 'processing', remoteStatus = 'SUCCESS', amount = 35967 } = {}) {
  const order = { _id: 'o', refundStatus: 'processing' };
  const refund = { order: 'o', outRefundNo: 'rf', amount: 359.67, status };
  const queries = [], settlements = [], timers = [];
  const mocks = {
    '../models/Refund': { findOne: () => ({ sort: async () => refund }) },
    '../models/Order': { find: filter => {
      assert.equal(filter.tradeStatus, 'refund_pending');
      assert.equal(filter.refundStatus, 'processing');
      return { select: () => ({ lean: () => ({ cursor: () => [order] }) }) };
    } },
    './tenantScope': { runWithoutTenantScope: fn => fn() },
    './orderSettlement': { confirmRefund: async (row, snapshot) => settlements.push([row, snapshot.source]) },
    './wechatPay': { queryRefund: async id => {
      queries.push(id);
      return { out_refund_no: id, status: remoteStatus, amount: { refund: amount } };
    } },
  };
  const timer = (fn, delay) => { timers.push({ fn, delay }); return { unref() {} }; };
  const ctx = { module: { exports: {} }, require: id => mocks[id], setTimeout: timer, setInterval: timer, console: { error() {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/reconcileRefund'), 'utf8'), ctx);
  ctx.module.exports.startRefundReconciliation();
  return { queries, settlements, timers };
}

test('startup and periodic reconciliation confirm a matched successful refund without a customer request', async () => {
  const h = harness();
  assert.deepEqual(h.timers.map(timer => timer.delay), [5000, 60000]);
  await h.timers[0].fn();
  assert.deepEqual(h.queries, ['rf']);
  assert.equal(h.settlements[0][1], 'scheduled_refund_query');
});

test('pending, mismatched and unapproved refunds are not settled', async () => {
  for (const config of [{ remoteStatus: 'PROCESSING' }, { amount: 1 }, { status: 'requested' }]) {
    const h = harness(config);
    await h.timers[1].fn();
    assert.equal(h.settlements.length, 0);
  }
});

test('confirmed receipt can complete an interrupted local settlement', async () => {
  const h = harness({ status: 'succeeded' });
  await h.timers[1].fn();
  assert.equal(h.queries.length, 0);
  assert.equal(h.settlements.length, 1);
});
