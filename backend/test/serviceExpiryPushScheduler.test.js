const test = require('node:test');
const assert = require('node:assert/strict');
const { scanServiceExpiryPush } = require('../src/utils/serviceExpiryPushScheduler');

test('only a verified active period nearing expiry creates a deduplicated notification', async () => {
  const writes = [], enqueued = [];
  const users = [{ _id: 'valid' }, { _id: 'inactive' }, { _id: 'far' }];
  const sent = await scanServiceExpiryPush(new Date('2026-11-12T04:00:00Z'), {
    User: { find: () => ({ select() { return this; }, lean: async () => users }) },
    Message: {
      updateOne: async (filter, update) => { writes.push({ filter, update }); return { upsertedCount: 1 }; },
      findOne: () => ({ lean: async () => ({ _id: 'message', unread: true }) }),
    },
    resolve: async user => user._id === 'inactive' ? { active: false, endDate: '2026-11-13' }
      : { active: true, endDate: user._id === 'valid' ? '2026-11-15' : '2026-12-15' },
  });
  assert.equal(sent, 1);
  assert.equal(writes[0].update.$setOnInsert.pushCategory, 'service_exp');
  assert.equal(writes[0].filter.dedupeKey, 'service-expiry:valid:2026-11-15:3');
});
