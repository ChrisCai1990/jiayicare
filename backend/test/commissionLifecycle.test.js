const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const lifecyclePath = path.join(__dirname, '../src/utils/commissionLifecycle.js');
const { commissionBlockReason, cancellationReason } = require(lifecyclePath);
const paid = { _id: 'order', paymentStatus: 'paid', status: 'pending', refundStatus: 'none' };

test('only valid paid orders can approve or pay commissions', () => {
  assert.equal(commissionBlockReason(paid), '');
  for (const change of [{ status: 'cancelled' }, { paymentStatus: 'refunded' }, { paymentStatus: 'unpaid' },
    { refundStatus: 'requested' }, { refundStatus: 'processing' },
    { refundStatus: 'refunded' }, { tradeStatus: 'closed' }, { tradeStatus: 'refund_pending' }]) {
    assert.ok(commissionBlockReason({ ...paid, ...change }));
  }
  assert.ok(commissionBlockReason(null));
  assert.equal(cancellationReason({ ...paid, refundStatus: 'requested' }), '');
});

test('cancellation cancels unpaid commissions and flags paid money for recovery without erasing payment', async () => {
  const rows = ['pending', 'confirmed', 'paid', 'cancelled'].map(status => ({ orderId: 'order', status }));
  const module = { exports: {} };
  const Commission = { async updateMany(filter, update) {
    for (const row of rows) {
      if (row.orderId === filter.orderId && (filter.status.$in ? filter.status.$in.includes(row.status) : row.status === filter.status)) Object.assign(row, update.$set);
    }
  } };
  vm.runInNewContext(fs.readFileSync(lifecyclePath, 'utf8'), { module, require: () => Commission, Date });
  const cancel = module.exports.cancelOrderCommissions;
  await cancel(paid);
  assert.equal(rows[0].status, 'pending');
  await cancel({ ...paid, status: 'cancelled' });
  await cancel({ ...paid, status: 'cancelled' });
  assert.deepEqual(rows.map(row => row.status), ['cancelled', 'cancelled', 'paid', 'cancelled']);
  assert.equal(rows[2].reversalRequired, true);
  assert.ok(rows[0].cancelledAt);
  assert.ok(rows[0].cancellationReason);
});

test('all settlement entry points refuse cancelled/refunded/refunding orders before creating money', async () => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/commissionSettlement.js'), 'utf8'), {
    module,
    require: name => name === './commissionLifecycle' ? { commissionBlockReason } : {},
  });
  for (const change of [{ status: 'cancelled' }, { paymentStatus: 'refunded' }, { refundStatus: 'processing' }]) {
    const order = { ...paid, ...change, referrerId: 'staff' };
    for (const settle of Object.values(module.exports)) {
      assert.equal((await settle(order, { serviceItemKey: 'item' })).created.length, 0);
    }
  }
});

test('direct checkout never looks up an old push; explicit push purchase retains provenance', () => {
  const services = fs.readFileSync(path.join(__dirname, '../src/routes/services.js'), 'utf8');
  assert.doesNotMatch(services, /PushRecord\.findOne/);
  assert.match(services, /recipientUserId: req\.user\._id/);
  const user = fs.readFileSync(path.join(__dirname, '../src/routes/user.js'), 'utf8');
  assert.match(user, /pushRecordId: record\._id/);
  assert.match(user, /referrerId: record\.staffId/);
});
