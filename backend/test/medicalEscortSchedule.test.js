const test = require('node:test');
const assert = require('node:assert/strict');
const { medicalEscortSchedule: schedule } = require('../src/utils/medicalEscortSchedule');
test('real Order schema accepts all three date fields for the reported free-text itinerary', () => {
  const Order = require('../src/models/Order');
  const date = schedule('2026-09-23', '1：30耳科，2：30神经内科');
  const order = new Order({ desiredServiceDate: date, desiredServiceDateEnd: date, scheduledAt: date,
    medicalProxyPlan: { escortDate: '2026-09-23', escortTime: '1：30耳科，2：30神经内科' } });
  const errors = order.validateSync()?.errors || {};
  for (const key of ['desiredServiceDate', 'desiredServiceDateEnd', 'scheduledAt']) assert.equal(errors[key], undefined);
  assert.equal(order.medicalProxyPlan.escortTime, '1：30耳科，2：30神经内科');
});
test('free-text itinerary and ranges retain service day without guessing a clock', () => {
  for (const text of ['1：30耳科，2：30神经内科', '09:00-11:30', '下午陪同两个科室']) {
    assert.equal(schedule('2026-09-23', text).toISOString(), '2026-09-22T16:00:00.000Z');
  }
});
test('single explicit clock supports one-digit hours and Chinese colon', () => {
  assert.equal(schedule('2026-09-23', '9：30').toISOString(), '2026-09-23T01:30:00.000Z');
  assert.equal(schedule('2026-09-23', '13:30').toISOString(), '2026-09-23T05:30:00.000Z');
});
test('invalid dates and clock values fail with a readable 400 before persistence', () => {
  for (const [day, text] of [['2026-02-30', '09:30'], ['bad', '09:30'], ['', '说明'], ['2026-09-23', '25:00'], ['2026-09-23', '12:60'], ['2026-09-23', '']]) {
    assert.throws(() => schedule(day, text), error => error.status === 400 && !error.message.includes('Cast'));
  }
});
