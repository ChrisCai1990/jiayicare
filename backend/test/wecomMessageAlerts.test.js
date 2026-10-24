const test = require('node:test');
const assert = require('node:assert/strict');

test('new customer message alerts only the assigned, linked staff member without patient data', async t => {
  const models = {
    Message: require('../src/models/Message'),
    WecomMessageAlert: require('../src/models/WecomMessageAlert'),
    User: require('../src/models/User'),
    Admin: require('../src/models/Admin'),
    WecomAppLink: require('../src/models/WecomAppLink'),
  };
  const restored = [];
  const patch = (obj, key, value) => { restored.push([obj, key, obj[key]]); obj[key] = value; };
  const query = value => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => value });
  const previousEnv = Object.fromEntries(['WECOM_MESSAGE_ALERTS_ENABLED', 'WECOM_MESSAGE_ALERTS_START_AT', 'WECOM_SIDEBAR_ORIGIN', 'WECOM_CORP_ID', 'WECOM_APP_SECRET', 'WECOM_AGENT_ID'].map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    WECOM_MESSAGE_ALERTS_ENABLED: 'true', WECOM_MESSAGE_ALERTS_START_AT: '2026-10-24T00:00:00Z',
    WECOM_SIDEBAR_ORIGIN: 'https://staff.example.test', WECOM_CORP_ID: 'corp',
    WECOM_APP_SECRET: 'synthetic', WECOM_AGENT_ID: '123',
  });
  const originalFetch = global.fetch;
  t.after(() => {
    for (const [obj, key, value] of restored) obj[key] = value;
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  const message = { _id: 'm1', user: 'p1', type: 'user', recipient: 'nutritionist', conversationId: 'p1_nutritionist',
    content: '不得出现在提醒里的病情描述', createdAt: new Date('2026-10-24T01:00:00Z') };
  const delivery = { _id: 'd1', messageId: 'm1', status: 'sending' };
  let patient = { _id: 'p1', tenantId: 'tenant1', assignedNutritionist: 's1' };
  let staff = { _id: 's1', tenantId: 'tenant1', role: 'nutritionist', staffStatus: 'active' };
  let recentlyNotified = false;
  let sent = 0;
  const statuses = [];
  patch(models.Message, 'find', () => query([]));
  patch(models.Message, 'findById', () => query(message));
  patch(models.WecomMessageAlert, 'find', () => query([delivery]));
  patch(models.WecomMessageAlert, 'findOneAndUpdate', () => query(delivery));
  patch(models.WecomMessageAlert, 'findOne', filter => {
    assert.equal(filter.conversationId, message.conversationId);
    return query(recentlyNotified ? { status: 'sent' } : null);
  });
  patch(models.WecomMessageAlert, 'updateOne', async (_filter, update) => { statuses.push(update.$set.status); });
  patch(models.User, 'findById', () => query(patient));
  patch(models.Admin, 'findById', () => query(staff));
  patch(models.WecomAppLink, 'findOne', filter => {
    assert.equal(filter.staffId, 's1');
    assert.equal(filter.tenantId, 'tenant1');
    return query({ userId: 'wecom_s1' });
  });
  global.fetch = async (url, options) => {
    if (url.includes('gettoken')) return { ok: true, json: async () => ({ access_token: 'synthetic' }) };
    const body = JSON.parse(options.body);
    assert.equal(body.touser, 'wecom_s1');
    assert.equal(body.text.content.includes('/notifications?tab=userMsgs'), true);
    assert.equal(body.text.content.includes(message.content), false);
    assert.equal(body.text.content.includes('p1'), false);
    sent++;
    return { ok: true, json: async () => ({ errcode: 0 }) };
  };
  const { tick } = require('../src/utils/wecomMessageAlerts');
  await tick();
  assert.equal(sent, 1);
  assert.deepEqual(statuses, ['sent']);

  statuses.length = 0;
  recentlyNotified = true;
  await tick();
  assert.equal(sent, 1);
  assert.deepEqual(statuses, ['skipped']);

  statuses.length = 0;
  recentlyNotified = false;
  patient = { ...patient, assignedNutritionist: 'other' };
  staff = { ...staff, tenantId: 'tenant2' };
  await tick();
  assert.equal(sent, 1);
  assert.deepEqual(statuses, ['skipped']);

  statuses.length = 0;
  message.staffReadAt = new Date();
  await tick();
  assert.equal(sent, 1);
  assert.deepEqual(statuses, ['skipped']);
});
