const test = require('node:test');
const assert = require('node:assert/strict');
const FollowUp = require('../src/models/FollowUp');
const Order = require('../src/models/Order');
const Admin = require('../src/models/Admin');
const Delivery = require('../src/models/StaffOrderPushDelivery');
const Device = require('../src/models/StaffPushDevice');
const { sendOrder } = require('../src/utils/staffPush');

const patch = (model, key, replacement, restore) => {
  const original = model[key]; model[key] = replacement;
  restore.push(() => { model[key] = original; });
};

test('planner order notification is skipped when task ownership changed', async () => {
  const restore = [], states = [];
  try {
    patch(FollowUp, 'findById', () => ({ lean: async () => ({ _id: 'task', assignedTo: 'other',
      tenantId: 'tenant', sourceType: 'order', status: 'planned', sourceOrderId: 'order', patientId: 'patient' }) }), restore);
    patch(Admin, 'findById', () => ({ lean: async () => ({ _id: 'planner', tenantId: 'tenant',
      role: 'healthPlanner', staffStatus: 'active' }) }), restore);
    patch(Delivery, 'updateOne', async (_query, update) => { states.push(update.$set.status); }, restore);
    await sendOrder({ _id: 'delivery', taskId: 'task', staffId: 'planner' },
      { send: async () => { throw new Error('must not notify previous owner'); } });
    assert.deepEqual(states, ['skipped']);
  } finally { restore.reverse().forEach(fn => fn()); }
});

test('planner order notification is skipped for unpaid orders', async () => {
  const restore = [], states = [];
  try {
    patch(FollowUp, 'findById', () => ({ lean: async () => ({ _id: 'task', assignedTo: 'planner',
      tenantId: 'tenant', sourceType: 'order', status: 'planned', sourceOrderId: 'order', patientId: 'patient' }) }), restore);
    patch(Admin, 'findById', () => ({ lean: async () => ({ _id: 'planner', tenantId: 'tenant',
      role: 'healthPlanner', staffStatus: 'active' }) }), restore);
    patch(Order, 'findOne', () => ({ lean: async () => null }), restore);
    patch(Delivery, 'updateOne', async (_query, update) => { states.push(update.$set.status); }, restore);
    await sendOrder({ _id: 'delivery', taskId: 'task', staffId: 'planner' },
      { send: async () => { throw new Error('must not notify unpaid order'); } });
    assert.deepEqual(states, ['skipped']);
  } finally { restore.reverse().forEach(fn => fn()); }
});

test('new paid customer order task sends a generic notification with task badge', async () => {
  const restore = [], sent = [], states = [];
  try {
    patch(FollowUp, 'findById', () => ({ lean: async () => ({ _id: 'task', assignedTo: 'planner',
      tenantId: 'tenant', sourceType: 'order', status: 'planned', sourceOrderId: 'order', patientId: 'patient' }) }), restore);
    patch(Admin, 'findById', () => ({ lean: async () => ({ _id: 'planner', tenantId: 'tenant',
      role: 'healthPlanner', staffStatus: 'active' }) }), restore);
    patch(Order, 'findOne', () => ({ lean: async () => ({ _id: 'order', user: 'patient', tenantId: 'tenant',
      paymentStatus: 'paid', initiationSource: 'customer', status: 'pending' }) }), restore);
    patch(Device, 'find', () => ({ select: () => ({ lean: async () => [{ token: 'device-token' }] }) }), restore);
    patch(Delivery, 'updateOne', async (_query, update) => { states.push(update.$set.status); }, restore);
    await sendOrder({ _id: 'delivery', taskId: 'task', staffId: 'planner' },
      { send: async (...args) => sent.push(args) }, async () => 4);
    assert.deepEqual(sent, [['device-token', 4, '有新的服务产品订单任务待处理，请打开工作台查看。']]);
    assert.deepEqual(states, ['sent']);
  } finally { restore.reverse().forEach(fn => fn()); }
});
