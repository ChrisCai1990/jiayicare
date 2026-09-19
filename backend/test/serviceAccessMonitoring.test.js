const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const Reminder = require('../src/models/Reminder');
const Message = require('../src/models/Message');
const HealthRecord = require('../src/models/HealthRecord');
const resolver = require('../src/utils/serviceAccess');
const { syncServiceCycleMonitoringReminders, activeToday } = require('../src/utils/annualPlanMonitoringReminders');
test('无有效服务期只暂停系统监测并收起该通知未读，不创建任务或清除用户关闭偏好', async t => {
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: 'patient' }) }) }));
  t.mock.method(resolver, 'resolveServiceAccess', async () => ({ active: false }));
  t.mock.method(Reminder, 'updateMany', async (q, u) => { assert.equal(q.systemManaged, true); assert.equal(String(q.sourceKey), '/^service-cycle:/'); assert.deepEqual(u.$set, { enabled: false }); });
  t.mock.method(Message, 'updateOne', async (q, u) => { assert.equal(q.dedupeKey, 'health-monitoring:patient'); assert.equal(u.$set.unread, false); });
  assert.equal((await syncServiceCycleMonitoringReminders('patient')).paused, true);
});
test('续约复用血压体重提醒和新服务期，保留用户主动关闭', async t => {
  const writes = [];
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: 'patient', age: 40, serviceExpiry: '2020-01-01' }) }) }));
  t.mock.method(resolver, 'resolveServiceAccess', async () => ({ active: true, source: 'verified_renewal', startDate: '2027-01-01', endDate: '2027-12-31' }));
  t.mock.method(HealthRecord, 'find', () => ({ sort: () => ({ limit: () => ({ select: () => ({ lean: async () => [] }) }) }) }));
  t.mock.method(Reminder, 'findOne', q => ({ select: () => ({ lean: async () => ({ userDisabled: q.sourceKey.endsWith('weight') }) }) }));
  t.mock.method(Reminder, 'updateOne', async (q, u) => { writes.push(u.$set); assert.match(q.sourceKey, /^service-cycle:/); return { modifiedCount: 1 }; });
  t.mock.method(Reminder, 'updateMany', async () => ({}));
  t.mock.method(Reminder, 'find', () => ({ lean: async () => [] }));
  t.mock.method(Message, 'updateOne', async () => ({}));
  const result = await syncServiceCycleMonitoringReminders('patient');
  assert.equal(result.created, 0); assert.equal(result.updated, 2);
  assert.equal(writes[0].enabled, true); assert.equal(writes[1].enabled, false);
  assert.equal(writes[0].endDate.toISOString(), '2027-12-31T15:59:59.999Z');
});
test('监测启停按北京时间跨午夜，与服务器时区无关', () => {
  const reminder = { enabled: true, startDate: '2027-01-01', endDate: '2027-12-31', daysOfWeek: [] };
  assert.equal(activeToday(reminder, new Date('2026-12-31T15:59:59Z')), false);
  assert.equal(activeToday(reminder, new Date('2026-12-31T16:00:00Z')), true);
  assert.equal(activeToday(reminder, new Date('2027-12-31T16:00:00Z')), false);
});
