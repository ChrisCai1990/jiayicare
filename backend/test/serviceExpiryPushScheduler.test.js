const test = require('node:test');
const assert = require('node:assert/strict');
const { scanServiceExpiryPush } = require('../src/utils/serviceExpiryPushScheduler');

test('only a verified active period nearing expiry creates a deduplicated notification', async () => {
  const writes = [];
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

test('calendar month and 15 days create customer messages and staff tasks once, even before client onboarding', async () => {
  const messages = new Map(), tasks = new Map();
  const user = { _id: 'customer', name: '王女士', tenantId: 'tenant', assignedHealthManager: 'manager', servicePackage: '年度服务包', onboardingCompleted: false };
  const models = {
    User: { find: () => ({ select() { return this; }, lean: async () => [user] }) },
    Message: { updateOne: async (filter, update) => {
      const fresh = !messages.has(filter.dedupeKey);
      messages.set(filter.dedupeKey, update.$setOnInsert);
      return { upsertedCount: Number(fresh) };
    } },
    FollowUp: { updateOne: async (filter, update) => {
      tasks.set(String(filter._id), update.$setOnInsert);
    } },
    Admin: { findOne: filter => ({ select() { return this; }, lean: async () =>
      filter._id === 'manager' ? { _id: 'manager', tenantId: 'tenant' } : null }) },
    resolve: async () => ({ active: true, endDate: '2027-03-31' }),
  };
  assert.equal(await scanServiceExpiryPush(new Date('2027-02-28T04:00:00Z'), models), 1);
  assert.equal(await scanServiceExpiryPush(new Date('2027-02-28T04:00:00Z'), models), 0);
  assert.equal(await scanServiceExpiryPush(new Date('2027-03-16T04:00:00Z'), models), 1);
  assert.equal(messages.size, 2);
  assert.equal(tasks.size, 2);
  assert.ok([...messages.values()].every(m => m.title === '年度会员续约提醒' && m.pushCategory === 'service_exp'));
  assert.ok([...tasks.values()].every(t => t.assignedTo === 'manager' && t.clientVisible === false));
});

test('already renewed service does not send renewal reminder for the old period', async () => {
  let writes = 0;
  await scanServiceExpiryPush(new Date('2027-02-28T04:00:00Z'), {
    User: { find: () => ({ select() { return this; }, lean: async () => [{ _id: 'customer', servicePackage: '年度服务包' }] }) },
    Message: { updateOne: async () => { writes++; } },
    resolve: async (_user, now) => now.toISOString().startsWith('2027-04')
      ? { active: true, endDate: '2028-03-31' } : { active: true, endDate: '2027-03-31' },
  });
  assert.equal(writes, 0);
});

test('quarterly service does not receive annual renewal reminder', async () => {
  let writes = 0;
  await scanServiceExpiryPush(new Date('2027-02-28T04:00:00Z'), {
    User: { find: () => ({ select() { return this; }, lean: async () => [{ _id: 'customer', servicePackage: 'pkg_3m' }] }) },
    Message: { updateOne: async () => { writes++; } },
    resolve: async () => ({ active: true, source: 'legacy', startDate: '2027-01-01', endDate: '2027-03-31' }),
  });
  assert.equal(writes, 0);
});
