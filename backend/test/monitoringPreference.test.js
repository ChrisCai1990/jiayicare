const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const Reminder = require('../src/models/Reminder');
const { monitoringEnabled } = require('../src/utils/monitoringPreference');

test('新旧建档客户默认开启，旧版主动关闭者保持关闭', async t => {
  const preferences = new Map();
  const writes = [];
  t.mock.method(Reminder, 'exists', async q => q.user === 'legacy-off' ? { _id: 'reminder' } : null);
  t.mock.method(User, 'updateOne', async (q, u) => {
    writes.push([q._id, u.$set.healthMonitoringPreference]);
    if (!preferences.has(q._id)) preferences.set(q._id, u.$set.healthMonitoringPreference);
  });
  t.mock.method(User, 'findById', id => ({ select: () => ({ lean: async () => ({ healthMonitoringPreference: preferences.get(id) }) }) }));
  assert.equal(await monitoringEnabled({ _id: 'new', onboardingCompleted: true }), true);
  assert.equal(await monitoringEnabled({ _id: 'legacy-off', onboardingCompleted: true, healthMonitoringConsentAt: null }), false);
  assert.equal(await monitoringEnabled({ _id: 'legacy-on', onboardingCompleted: true, healthMonitoringConsentAt: new Date() }), true);
  assert.deepEqual(writes, [['new', 'enabled'], ['legacy-off', 'disabled'], ['legacy-on', 'enabled']]);
});

test('明确关闭者不会被周期扫描重新开启', async () => {
  assert.equal(await monitoringEnabled({ _id: 'off', onboardingCompleted: true, healthMonitoringPreference: 'disabled' }), false);
  assert.equal(await monitoringEnabled({ _id: 'on', onboardingCompleted: true, healthMonitoringPreference: 'enabled' }), true);
  assert.equal(await monitoringEnabled({ _id: 'unfinished', onboardingCompleted: false }), false);
});
