const test = require('node:test');
const assert = require('node:assert/strict');
const AppointmentReminder = require('../src/models/AppointmentReminder');
const { buildAppointmentReminderTimes, scheduleExpertAppointmentReminders } = require('../src/utils/appointmentReminderScheduler');

test('expert appointment reminders run one day and two hours before the visit', () => {
  const result = buildAppointmentReminderTimes(new Date('2026-09-17T10:00:00+08:00'));
  assert.deepEqual(result.map(item => [item.kind, item.remindAt.toISOString()]), [
    ['day_before', '2026-09-16T02:00:00.000Z'],
    ['two_hours_before', '2026-09-17T00:00:00.000Z'],
  ]);
});

test('one order keeps independent reminders for multiple appointments', async () => {
  const original = AppointmentReminder.findOneAndUpdate;
  const keys = [];
  try {
    AppointmentReminder.findOneAndUpdate = async filter => { keys.push(filter.kind); };
    const order = { _id: 'order-1', user: 'user-1' };
    for (const slotIndex of [0, 1]) await scheduleExpertAppointmentReminders({ order, appointmentDate: new Date('2030-09-17T10:00:00+08:00'), appointmentText: '已预约', slotIndex, now: new Date('2030-09-01T00:00:00+08:00') });
    assert.deepEqual(keys, ['day_before:0', 'two_hours_before:0', 'day_before:1', 'two_hours_before:1']);
  } finally { AppointmentReminder.findOneAndUpdate = original; }
});
