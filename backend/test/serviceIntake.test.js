const test = require('node:test'), assert = require('node:assert/strict');
const { responseDueAt, progress, futureDate } = require('../src/utils/serviceIntake');
test('response SLA carries two business hours across evenings and weekends in China time', () => {
  assert.equal(responseDueAt('2026-09-25T08:30:00Z').toISOString(), '2026-09-28T02:30:00.000Z');
  assert.equal(responseDueAt('2026-09-28T00:00:00Z').toISOString(), '2026-09-28T03:00:00.000Z');
  assert.equal(responseDueAt('2026-09-28T07:00:00Z').toISOString(), '2026-09-28T09:00:00.000Z');
  assert.equal(responseDueAt('bad'), null);
});
test('intake closure cannot impersonate fulfillment, even when all generated tasks ended', () => {
  const row = { status: 'open', orderId: 'order', nextContactAt: '2020-01-01' };
  assert.equal(progress(row, { status: 'pending', paymentStatus: 'paid' }, null).canClose, false);
  assert.equal(progress(row, { status: 'completed' }, null, [{ status: 'planned', theme: '回收资料' }]).canClose, false);
  assert.equal(progress(row, null, null).canClose, false);
  assert.equal(progress(row, { status: 'completed' }, null).canClose, true);
  assert.equal(progress(row, { status: 'pending' }, null).stage, '待确认支付');
  assert.equal(progress(row, { status: 'completed' }, null).overdue, true);
  assert.equal(progress({ ...row, status: 'closed' }, { status: 'completed' }, null).overdue, false);
  assert.throws(() => futureDate('2000-01-01'), /未来/);
});
