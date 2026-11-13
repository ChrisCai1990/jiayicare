const test = require('node:test');
const assert = require('node:assert/strict');
const { isDue, scanCustomerReminders } = require('../src/utils/customerReminderPushScheduler');

test('Beijing scheduled time, recurrence and disabled state gate reminder delivery', () => {
  const now = new Date('2026-11-12T00:01:00Z'); // 08:01 Beijing
  const base = { enabled: true, scheduleType: 'recurring', reminderTime: '08:00', daysOfWeek: [] };
  assert.equal(isDue(base, now), true);
  assert.equal(isDue({ ...base, enabled: false }, now), false);
  assert.equal(isDue({ ...base, systemManaged: true }, now), false);
  assert.equal(isDue(base, new Date('2026-11-12T00:06:00Z')), false);
  assert.equal(isDue({ ...base, daysOfWeek: ['Fri'] }, now), false);
  assert.equal(isDue({ ...base, scheduleType: 'once', targetDate: new Date('2026-11-12T00:00:00Z') }, now), true);
  assert.equal(isDue({ ...base, scheduleType: 'once', targetDate: new Date('2026-11-13T00:00:00Z') }, now), false);
});

test('due reminder creates one durable message and queues it for native delivery', async () => {
  const sent = [], writes = [];
  const reminder = { _id: 'reminder', user: 'patient', enabled: true, category: 'exercise_checkin',
    title: '运动计划', description: '按计划运动', scheduleType: 'recurring', reminderTime: '08:00' };
  const result = await scanCustomerReminders(new Date('2026-11-12T00:01:00Z'), {
    Reminder: { find: filter => ({ lean: async () => filter.systemManaged === true ? [] : [reminder] }) },
    User: { exists: async () => true },
    Message: {
      updateOne: async (filter, update) => { writes.push({ filter, update }); return { upsertedCount: 1 }; },
      findById: () => ({ lean: async () => ({ _id: 'message', unread: true }) }),
    },
    ObjectId: class { constructor(value) { this.value = value; } },
    enqueue: async message => sent.push(message),
  });
  assert.equal(result, 1);
  assert.equal(writes[0].update.$setOnInsert.pushCategory, 'exercise');
  assert.equal(writes[0].update.$setOnInsert.dedupeKey, 'customer-reminder:reminder:2026-11-12:08:00');
  assert.equal(sent.length, 1);
});
