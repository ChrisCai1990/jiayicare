const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAppointmentReminderTimes } = require('../src/utils/appointmentReminderScheduler');

test('expert appointment reminders run one day and two hours before the visit', () => {
  const result = buildAppointmentReminderTimes(new Date('2026-09-17T10:00:00+08:00'));
  assert.deepEqual(result.map(item => [item.kind, item.remindAt.toISOString()]), [
    ['day_before', '2026-09-16T02:00:00.000Z'],
    ['two_hours_before', '2026-09-17T00:00:00.000Z'],
  ]);
});
