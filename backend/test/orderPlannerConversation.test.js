const test = require('node:test');
const assert = require('node:assert/strict');
const Message = require('../src/models/Message');
const Order = require('../src/models/Order');
const { latestOpenOrderConversationAction } = require('../src/utils/orderPlannerConversation');

test('customer reply inherits the most recent real order conversation, not only a system prompt', async () => {
  const originalFindOne = Message.findOne;
  const originalExists = Order.exists;
  try {
    Message.findOne = filter => {
      assert.deepEqual(filter['action.type'].$in, ['order_planner_confirmation', 'order_conversation']);
      return { sort: () => ({ select: () => ({ lean: async () => ({ action: { type: 'order_conversation', orderId: 'planning-order' } }) }) }) };
    };
    Order.exists = async filter => {
      assert.equal(filter._id, 'planning-order');
      return true;
    };
    assert.deepEqual(await latestOpenOrderConversationAction('user-1', 'user-1_planner'), { type: 'order_conversation', orderId: 'planning-order' });
  } finally {
    Message.findOne = originalFindOne;
    Order.exists = originalExists;
  }
});
