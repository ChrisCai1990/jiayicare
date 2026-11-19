const test = require('node:test');
const assert = require('node:assert/strict');
const Group = require('../src/models/InAppServiceGroup');
const GroupMessage = require('../src/models/InAppServiceGroupMessage');
const GroupDelivery = require('../src/models/StaffGroupPushDelivery');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const { enqueueGroup, sendGroup } = require('../src/utils/staffPush');

const patch = (model, key, replacement, restore) => {
  const original = model[key];
  model[key] = replacement;
  restore.push(() => { model[key] = original; });
};
const readyEnv = {
  STAFF_PUSH_ENABLED: 'true', STAFF_HUAWEI_PUSH_CLIENT_ID: '119869889',
  STAFF_HUAWEI_PUSH_CLIENT_SECRET: 'test-secret-123456789', STAFF_PUSH_START_AT: '2026-11-19T00:00:00Z',
};

test('group push queues only currently assigned group members', async () => {
  const restore = [];
  const oldEnv = Object.fromEntries(Object.keys(readyEnv).map(key => [key, process.env[key]]));
  Object.assign(process.env, readyEnv);
  const recipients = [];
  try {
    patch(Group, 'findOne', () => ({ lean: async () => ({ _id: 'group-1', tenantId: 'tenant-1',
      status: 'active', patientId: 'patient-1', memberIds: ['staff-1', 'staff-2'] }) }), restore);
    patch(User, 'findOne', () => ({ lean: async () => ({ _id: 'patient-1', tenantId: 'tenant-1',
      assignedHealthManager: 'staff-1' }) }), restore);
    patch(GroupDelivery, 'updateOne', async query => { recipients.push(String(query.staffId)); }, restore);
    patch(GroupMessage, 'updateOne', async () => {}, restore);
    await enqueueGroup({ _id: 'message-1', groupId: 'group-1', tenantId: 'tenant-1',
      senderType: 'customer', staffPushEligible: true });
    assert.deepEqual(recipients, ['staff-1']);
  } finally {
    restore.reverse().forEach(fn => fn());
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('group push skips delivery after group membership changes', async () => {
  const restore = [];
  const statuses = [];
  const sender = { send: async () => { throw new Error('must not send'); } };
  try {
    patch(GroupMessage, 'findById', () => ({ lean: async () => ({ _id: 'message-1',
      groupId: 'group-1', patientId: 'patient-1', tenantId: 'tenant-1', senderType: 'customer',
      staffPushEligible: true, createdAt: new Date('2026-11-19T01:00:00Z') }) }), restore);
    patch(Admin, 'findById', () => ({ lean: async () => ({ _id: 'staff-1', tenantId: 'tenant-1',
      role: 'healthManager', staffStatus: 'active' }) }), restore);
    patch(Group, 'findOne', () => ({ lean: async () => ({ _id: 'group-1', tenantId: 'tenant-1',
      patientId: 'patient-1', status: 'active', memberIds: ['staff-2'],
      lastCustomerMessageAt: new Date('2026-11-19T01:00:00Z') }) }), restore);
    patch(User, 'findOne', () => ({ lean: async () => ({ _id: 'patient-1', tenantId: 'tenant-1',
      assignedHealthManager: 'staff-1' }) }), restore);
    patch(GroupDelivery, 'updateOne', async (_query, update) => { statuses.push(update.$set.status); }, restore);
    await sendGroup({ _id: 'delivery-1', groupMessageId: 'message-1', staffId: 'staff-1' },
      { startAt: new Date('2026-11-19T00:00:00Z') }, sender);
    assert.deepEqual(statuses, ['skipped']);
  } finally { restore.reverse().forEach(fn => fn()); }
});
