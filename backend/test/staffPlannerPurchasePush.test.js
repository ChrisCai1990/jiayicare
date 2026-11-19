const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../src/models/Order');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const Device = require('../src/models/StaffPushDevice');
const Delivery = require('../src/models/StaffPlannerPurchaseDelivery');
const { sendPurchase } = require('../src/utils/staffPush');

const patch = (model, key, replacement, restore) => {
  const original = model[key]; model[key] = replacement;
  restore.push(() => { model[key] = original; });
};

async function scenario({ paymentStatus = 'paid', assignedHealthPlanner = 'planner', staffStatus = 'active' } = {}) {
  const restore = [], sent = [], states = [];
  try {
    patch(Order, 'findById', () => ({ lean: async () => ({ _id: 'order', user: 'patient', tenantId: 'tenant',
      initiationSource: 'customer', paymentStatus, status: 'pending', tradeStatus: 'paid' }) }), restore);
    patch(Admin, 'findById', () => ({ lean: async () => ({ _id: 'planner', tenantId: 'tenant',
      role: 'healthPlanner', staffStatus }) }), restore);
    patch(User, 'findOne', () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner }) }) }), restore);
    patch(Device, 'find', () => ({ select: () => ({ lean: async () => [{ token: 'device-token' }] }) }), restore);
    patch(Delivery, 'updateOne', async (_query, update) => { states.push(update.$set.status); }, restore);
    await sendPurchase({ _id: 'delivery', orderId: 'order', staffId: 'planner' },
      { send: async (...args) => sent.push(args) }, async () => 3);
    return { sent, states };
  } finally { restore.reverse().forEach(fn => fn()); }
}

test('paid customer purchase alerts current assigned planner and sets order badge', async () => {
  assert.deepEqual(await scenario(), { sent: [['device-token', 3,
    '有新的服务产品订单待处理，请打开工作台查看。']], states: ['sent'] });
});

test('unpaid purchase and changed planner do not alert the former owner', async () => {
  assert.deepEqual(await scenario({ paymentStatus: 'pending' }), { sent: [], states: ['skipped'] });
  assert.deepEqual(await scenario({ assignedHealthPlanner: 'other' }), { sent: [], states: ['skipped'] });
  assert.deepEqual(await scenario({ staffStatus: 'inactive' }), { sent: [], states: ['skipped'] });
});
