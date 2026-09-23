const test = require('node:test'), assert = require('node:assert/strict');
const { followUpKey, isAssistance, needsBooking } = require('../../shared/annualServiceItem.cjs');
const { summarize } = require('../src/utils/supervisionProgress');
const { receipt } = require('../src/utils/annualBookingReceipt');
const request = { patientId: 'p', sourceAnnualPlanId: 'a', sourceType: 'annual_service', workflowKey: 'service_request', sourceScheduleKey: 'service-request:abnormal_followup:0:2026-12-02', formData: { serviceRequest: { moduleKey: 'abnormal_followup', itemSnapshot: { items: '肾脏彩超', hospital: '浙二医院' } } } };
const followup = { patientId: 'p', sourceAnnualPlanId: 'a', sourceType: 'scheduled', sourceScheduleKey: 'abnormal_followup:2026-12-02:浙二医院', deliveryMode: 'single', status: 'planned' };
test('annual supervisor sees only its own assistance, never the annual reminders', () => {
  const rows = [followup, { ...followup, sourceScheduleKey: 'medical_treatment:2026-10-01:眼科医院', deliveryMode: 'reminder' }, { ...followup, sourceAnnualPlanId: 'b' }];
  const result = summarize(request, rows);
  assert.equal(result.total, 1); assert.match(result.current[0].label, /预约/);
  assert.equal(summarize(request, [{ ...followup, deliveryMode: 'reminder' }]).total, 0);
  assert.equal(summarize({ ...request, formData: null }, rows).total, 0);
});
test('stable key follows original hospital-first identity; missing key fails closed', () => {
  assert.equal(followUpKey(request), followup.sourceScheduleKey);
  assert.equal(followUpKey({ ...request, sourceScheduleKey: 'bad' }), null);
});
test('only assistance appointment stages enter service workbench; completion preserves followup', () => {
  assert.equal(needsBooking(followup), true);
  for (const patch of [{ deliveryMode: 'reminder' }, { status: 'completed' }, { serviceTracking: { linkId: 'l' } }, { annualBooking: { status: 'booked' } }, { sourceScheduleKey: 'medication:2026-01-01:x' }]) assert.equal(needsBooking({ ...followup, ...patch }), false);
  assert.equal(isAssistance({ ...followup, annualBooking: { status: 'booked' } }), true);
  assert.match(summarize(request, [{ ...followup, annualBooking: { status: 'booked' } }]).current[0].label, /待健康规划师派单/);
});
test('appointment receipt requires real date/hospital/department and retains author', () => {
  const body = { date: '2026-10-01', time: '09:30', hospital: '浙二', department: '超声科', note: '上午' };
  const task = { plannedContent: '就医/会诊医院：浙二\n科室：超声科\n专家：王医生' };
  const result = receipt(body, 'manager', task);
  assert.equal(result.confirmedBy, 'manager'); assert.equal(result.status, 'booked'); assert.equal(result.note, '上午');
  assert.equal(result.time, '09:30'); assert.equal(result.expert, '王医生');
  for (const patch of [{ date: '2026-02-30' }, { time: '25:00' }, { date: 'not a date' }, { hospital: '' }, { department: '' }, { note: {} }]) assert.throws(() => receipt({ ...body, ...patch }, 'manager', task));
});
test('actual service route includes future booking only when requested, never reminders', () => {
  const { staffTasks } = require('./helpers/taskVisibility');
  const rows = [{ ...followup, _id: 'booking', date: new Date('2026-12-02'), remindAt: new Date('2026-11-25') }, { ...followup, _id: 'reminder', deliveryMode: 'reminder' }];
  assert.deepEqual(Array.from(staffTasks(rows, { includeFuture: '1' }), r => r._id), ['booking']);
  assert.equal(staffTasks(rows).length, 0);
});
