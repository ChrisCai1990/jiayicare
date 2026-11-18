const test = require('node:test');
const assert = require('node:assert/strict');
const { pushReady, destination, assignee } = require('../src/utils/staffPushCore');
const { createStaffPushTransport } = require('../src/utils/staffPushTransport');

test('staff push remains closed without independent credentials and start time', () => {
  assert.equal(pushReady({ STAFF_PUSH_ENABLED: 'true' }), null);
  assert.equal(pushReady({ STAFF_PUSH_ENABLED: 'false', STAFF_HUAWEI_PUSH_CLIENT_ID: '12345',
    STAFF_HUAWEI_PUSH_CLIENT_SECRET: 'b'.repeat(24), STAFF_PUSH_START_AT: '2026-11-18T00:00:00Z' }), null);
  assert.ok(pushReady({ STAFF_PUSH_ENABLED: 'true', STAFF_HUAWEI_PUSH_CLIENT_ID: '12345',
    STAFF_HUAWEI_PUSH_CLIENT_SECRET: 'b'.repeat(24), STAFF_PUSH_START_AT: '2026-11-18T00:00:00Z' }));
});

test('destination rejects malformed tokens and has stable opaque key', () => {
  assert.throws(() => destination(''), { status: 400 });
  assert.throws(() => destination('abc\n12345678'), { status: 400 });
  const first = destination('registration_12345678');
  assert.equal(first._id, destination('registration_12345678')._id);
  assert.ok(!first._id.includes('registration'));
});

test('message recipient must be the active assigned staff in the same tenant', () => {
  const patient = { assignedHealthManager: 'staff-1', tenantId: 'tenant-1' };
  const staff = { _id: 'staff-1', tenantId: 'tenant-1', role: 'healthManager', staffStatus: 'active' };
  assert.equal(assignee({ recipient: 'manager' }, patient, staff), true);
  assert.equal(assignee({ recipient: 'doctor' }, patient, staff), false);
  assert.equal(assignee({ recipient: 'manager' }, patient, { ...staff, tenantId: 'tenant-2' }), false);
  assert.equal(assignee({ recipient: 'manager' }, patient, { ...staff, staffStatus: 'inactive' }), false);
  assert.equal(assignee({ recipient: 'manager' }, { ...patient, isDeleted: true }, staff), false);
  assert.equal(assignee({ recipient: 'manager' }, { ...patient, assignedHealthManager: 'staff-2' }, staff), false);
});

test('Huawei request is targeted, sets badge, and omits customer content', async () => {
  const calls = [];
  const transport = createStaffPushTransport({ clientId: '12345', clientSecret: 'server-secret',
    fetchImpl: async (url, input) => { calls.push({ url, input }); return { ok: true,
      json: async () => calls.length === 1 ? { access_token: 'access-token', expires_in: 3600 }
        : { code: '80000000' } }; } });
  await transport.send('huawei_token_12345678', 3);
  const request = calls[1].input;
  const body = JSON.parse(request.body);
  assert.equal(calls[1].url, 'https://push-api.cloud.huawei.com/v1/12345/messages:send');
  assert.deepEqual(body.message.token, ['huawei_token_12345678']);
  assert.equal(body.message.android.notification.badge.set_num, 3);
  assert.equal(body.message.android.notification.badge.class, 'com.jiayicare.staff.pilot.MainActivity');
  assert.equal(request.body.includes('customer'), false);
  assert.equal(request.body.includes('patient'), false);
  assert.equal(request.body.includes('server-secret'), false);
  assert.equal(request.headers.Authorization, 'Bearer access-token');
});
