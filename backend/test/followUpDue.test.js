const test = require('node:test');
const assert = require('node:assert/strict');
const { dueDate, scheduledContact } = require('../../shared/followUpDue.cjs');
test('历史配药随访保留原日期，本轮按已约定的下次时间计时', () => {
  const contact = { recordedAt: '2026-11-25T03:07:10Z', nextContactAt: '2026-12-21T03:06:00Z' };
  const task = { date: '2026-11-21', status: 'in_progress', nextFollowUpDate: contact.nextContactAt,
    progressRecords: [contact, { nextContactAt: null }] };
  assert.equal(dueDate(task), contact.nextContactAt);
  for (const nextFollowUpDate of [null, '2026-11-21']) {
    assert.equal(dueDate({ ...task, nextFollowUpDate }), contact.nextContactAt);
  }
  const rescheduled = { ...contact, nextContactAt: '2026-12-05T02:00:00Z' };
  assert.equal(dueDate({ ...task, progressRecords: [contact, rescheduled, {}] }), rescheduled.nextContactAt);
  assert.equal(scheduledContact(task).recordedAt, contact.recordedAt);
  assert.equal(dueDate({ ...task, progressRecords: [] }), task.date);
  assert.equal(dueDate({ ...task, status: 'completed' }), task.date);
});
