const test = require('node:test');
const assert = require('node:assert/strict');

test('a paid customer order alerts its assigned planner only after a workbench task exists', async t => {
  const models = {
    Order: require('../src/models/Order'),
    FollowUp: require('../src/models/FollowUp'),
    User: require('../src/models/User'),
    Admin: require('../src/models/Admin'),
    Link: require('../src/models/WecomAppLink'),
    Delivery: require('../src/models/WecomOrderAlert'),
  };
  const restored = [];
  const patch = (model, method, replacement) => {
    restored.push([model, method, model[method]]);
    model[method] = replacement;
  };
  const query = value => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => value });
  const keys = ['WECOM_ORDER_ALERTS_ENABLED', 'WECOM_ORDER_ALERTS_START_AT', 'WECOM_SIDEBAR_ORIGIN', 'WECOM_CORP_ID', 'WECOM_APP_SECRET', 'WECOM_AGENT_ID'];
  const previousEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    WECOM_ORDER_ALERTS_ENABLED: 'true', WECOM_ORDER_ALERTS_START_AT: '2026-10-31T00:00:00Z',
    WECOM_SIDEBAR_ORIGIN: 'https://staff.example.test', WECOM_CORP_ID: 'corp',
    WECOM_APP_SECRET: 'synthetic', WECOM_AGENT_ID: '123',
  });
  const oldFetch = global.fetch;
  t.after(() => {
    for (const [model, method, original] of restored) model[method] = original;
    global.fetch = oldFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  const order = { _id: 'order-1', user: 'patient-1', tenantId: 'tenant-1', initiationSource: 'customer',
    paymentStatus: 'pending', tradeStatus: 'awaiting_payment', refundStatus: 'none', status: 'pending',
    paidAt: null, serviceName: '不可出现在企微中的服务名' };
  const task = { _id: 'task-1', sourceType: 'order', sourceOrderId: 'order-1', assignedTo: 'planner-1', status: 'planned' };
  const patient = { _id: 'patient-1', tenantId: 'tenant-1', assignedHealthPlanner: 'planner-1', name: '不可出现在企微中的姓名' };
  const staff = { _id: 'planner-1', tenantId: 'tenant-1', role: 'healthPlanner', staffStatus: 'active' };
  let taskExists = false;
  let link = { userId: 'wecom-planner-1' };
  let delivery = null;
  let sends = 0;
  patch(models.Order, 'find', () => query(order.paymentStatus === 'paid' && !order.wecomOrderAlertQueuedAt ? [order] : []));
  patch(models.Order, 'findById', () => query(order));
  patch(models.Order.collection, 'updateOne', async () => { order.wecomOrderAlertQueuedAt = new Date(); });
  patch(models.FollowUp, 'find', () => query(taskExists ? [task] : []));
  patch(models.FollowUp, 'findById', () => query(task));
  patch(models.User, 'find', () => query([patient]));
  patch(models.User, 'findById', () => query(patient));
  patch(models.Admin, 'find', () => query([staff]));
  patch(models.Admin, 'findById', () => query(staff));
  patch(models.Link, 'findOne', () => query(link));
  patch(models.Delivery, 'find', () => query(delivery?.status === 'queued' ? [delivery] : []));
  patch(models.Delivery, 'findOneAndUpdate', () => query(delivery && Object.assign(delivery, { status: 'sending' })));
  patch(models.Delivery, 'updateOne', async (_filter, update) => {
    if (update.$setOnInsert) delivery ||= { _id: 'delivery-1', ...update.$setOnInsert };
    if (update.$set) Object.assign(delivery, update.$set);
  });
  global.fetch = async (url, options) => {
    if (url.includes('gettoken')) return { ok: true, json: async () => ({ access_token: 'synthetic' }) };
    const body = JSON.parse(options.body);
    assert.equal(body.touser, 'wecom-planner-1');
    assert.equal(body.text.content.includes('用户下单服务进程'), true);
    assert.equal(body.text.content.includes(order.serviceName), false);
    assert.equal(body.text.content.includes(patient.name), false);
    sends++;
    return { ok: true, json: async () => ({ errcode: 0 }) };
  };
  const { tick } = require('../src/utils/wecomOrderAlerts');
  await tick();
  assert.equal(delivery, null);
  order.paymentStatus = 'paid'; order.tradeStatus = 'paid'; order.paidAt = new Date('2026-10-31T01:00:00Z');
  await tick();
  assert.equal(delivery, null);
  taskExists = true;
  await tick();
  assert.equal(delivery.status, 'sent');
  assert.equal(sends, 1);
  await tick();
  assert.equal(sends, 1);

  delivery = null; order.wecomOrderAlertQueuedAt = null; link = null;
  await tick();
  assert.equal(delivery.status, 'skipped');
  assert.equal(delivery.reason, 'wecom_not_linked');
  assert.equal(sends, 1);

  delivery = null; order.wecomOrderAlertQueuedAt = null; link = { userId: 'wecom-planner-1' };
  patient.assignedHealthPlanner = 'planner-2';
  await tick();
  assert.equal(delivery, null);
  assert.equal(sends, 1);
});

test('order eligibility excludes unpaid, staff-originated, refunded and pre-rollout orders', () => {
  const { activeCustomerOrder } = require('../src/utils/wecomOrderAlerts');
  const startAt = new Date('2026-10-31T00:00:00Z');
  const base = { paymentStatus: 'paid', initiationSource: 'customer', status: 'pending',
    tradeStatus: 'paid', refundStatus: 'none', paidAt: new Date('2026-10-31T01:00:00Z') };
  assert.equal(activeCustomerOrder(base, startAt), true);
  for (const change of [
    { paymentStatus: 'pending' }, { initiationSource: 'staff_direct' }, { status: 'cancelled' },
    { refundStatus: 'requested' }, { paidAt: new Date('2026-10-30T23:59:59Z') },
  ]) assert.equal(activeCustomerOrder({ ...base, ...change }, startAt), false);
});
