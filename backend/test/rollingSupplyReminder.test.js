const test = require('node:test');
const assert = require('node:assert/strict');
const { addDays, nextReminderData } = require('../src/utils/rollingSupplyReminder');

test('addDays keeps the reminder time while advancing the interval', () => {
  assert.equal(addDays(new Date('2026-09-14T01:00:00.000Z'), 30).toISOString(), '2026-10-14T01:00:00.000Z');
});

test('nextReminderData creates one idempotently keyed open reminder', () => {
  const completed = {
    _id: 'completed-id', patientId: 'patient-id', staffId: 'staff-id', assignedTo: 'owner-id',
    completedAt: new Date('2026-09-14T01:00:00.000Z'), theme: '就医配取提醒 · 维生素D',
    plannedContent: '核对余量', tags: ['就医配取提醒', '营养素'], sourceId: 'source-id',
  };
  const next = nextReminderData(completed, { intervalDays: 30, mode: 'visit' });
  assert.equal(next.status, 'planned');
  assert.equal(next.type, 'wechat');
  assert.equal(next.date.toISOString(), '2026-10-14T01:00:00.000Z');
  assert.equal(next.sourceScheduleKey, 'rolling-supply:completed-id');
});
