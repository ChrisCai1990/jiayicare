const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const messages = [];
  const Message = {
    findOne: async query => messages.find(item => item.conversationId === query.conversationId
      && (item.action?.orderId === query.$or[0]['action.orderId']
        || item.dedupeKey === query.$or[1].dedupeKey)) || null,
    create: async item => { messages.push(item); return item; },
  };
  const mocks = {
    '../models/Message': Message,
    '../models/Order': {},
    './orderServiceConfirmation': {
      isCustomerConfirmedServiceOrder: () => false,
      needsCustomerServiceConfirmation: () => true,
    },
  };
  const context = { module: { exports: {} }, require: name => mocks[name] };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/orderPlannerConversation'), 'utf8'), context);
  return { ...context.module.exports, messages };
}

test('two paid orders with the same generic service name each get a linked planner message', async () => {
  const h = harness();
  const base = { user: 'member', serviceName: '医务代办服务', paymentStatus: 'paid', tradeStatus: 'paid' };
  await h.ensureOrderPlannerPrompt({ ...base, _id: 'med', specificationLabel: '代配药' });
  await h.ensureOrderPlannerPrompt({ ...base, _id: 'check', specificationLabel: '代约检（常规）' });
  await h.ensureOrderPlannerPrompt({ ...base, _id: 'check', specificationLabel: '代约检（常规）' });
  assert.equal(h.messages.length, 2);
  assert.deepEqual(h.messages.map(item => item.action.orderId), ['med', 'check']);
  assert.match(h.messages[1].content, /代约检（常规）/);
});

test('identical confirmation copy from separate paid orders is not treated as one order', async () => {
  const h = harness();
  const base = { user: 'member', serviceName: '医务代办服务', paymentStatus: 'paid', tradeStatus: 'paid' };
  await h.ensureOrderPlannerPrompt({ ...base, _id: 'first' });
  await h.ensureOrderPlannerPrompt({ ...base, _id: 'second' });
  assert.equal(h.messages.length, 2);
  assert.equal(h.messages[0].content, h.messages[1].content);
});
