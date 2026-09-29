const test = require('node:test'), assert = require('node:assert/strict');
const { responseDueAt, progress, futureDate } = require('../src/utils/serviceIntake');
test('response SLA carries two business hours across evenings and weekends in China time', () => {
  assert.equal(responseDueAt('2026-09-25T08:30:00Z').toISOString(), '2026-09-28T02:30:00.000Z');
  assert.equal(responseDueAt('2026-09-28T00:00:00Z').toISOString(), '2026-09-28T03:00:00.000Z');
  assert.equal(responseDueAt('2026-09-28T07:00:00Z').toISOString(), '2026-09-28T09:00:00.000Z');
  assert.equal(responseDueAt('bad'), null);
});
test('order handoff ends consultation independently of payment and fulfillment', () => {
  const { consultationStatus, consultationStatusFilter } = require('../src/utils/serviceIntake');
  const row = {status:'open', orderId:'order', nextContactAt:'2020-01-01'};
  const order = {status:'pending', paymentStatus:'pending'};
  const tasks = [{status:'planned',theme:'原订单待办'}];
  assert.equal(consultationStatus(row),'closed');
  assert.equal(progress(row,order,null,tasks).stage,'已转入订单流程');
  assert.equal(progress(row,order,null,tasks).overdue,false);
  assert.equal(order.status,'pending'); assert.equal(tasks[0].status,'planned');
  const sift = require('sift').default;
  assert.equal(sift(consultationStatusFilter('open'))(row),false);
  assert.equal(sift(consultationStatusFilter('closed'))(row),true);
  assert.equal(sift(consultationStatusFilter('open'))({status:'open'}),true);
  assert.equal(sift(consultationStatusFilter('closed'))({status:'open'}),false);
  assert.equal(consultationStatus({status:'open'}),'open');
  assert.throws(() => futureDate('2000-01-01'), /未来/);
});
