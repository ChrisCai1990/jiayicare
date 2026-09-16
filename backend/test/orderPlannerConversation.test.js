const test = require('node:test');
const assert = require('node:assert/strict');
const Message = require('../src/models/Message');
const Order = require('../src/models/Order');
const { customerOrderNote, extractExplicitServiceTime, buildOrderPlannerPrompt, latestOpenOrderConversationAction } = require('../src/utils/orderPlannerConversation');

test('planner prompt keeps customer requirements and removes settlement metadata', () => {
  assert.equal(customerOrderNote('规格：基础版；周五上午；健康基金抵扣¥25；支付方式：wechat_pay'), '规格：基础版；周五上午');
  assert.equal(extractExplicitServiceTime('希望周五上午安排'), '周五');
});
test('non-booking mall orders receive the standard planner message after payment', () => {
  const content = buildOrderPlannerPrompt({
    paymentStatus: 'paid', tradeStatus: 'paid', refundStatus: 'none',
    fulfillmentType: 'delivery_and_service', serviceName: '营养补充产品',
  });
  assert.equal(content, '已收到您的“营养补充产品”订单，支付已确认。健康规划师会跟进后续服务或交付安排；如有需要补充的信息，可直接在这里留言。');
});

test('paid medication proxy orders begin with AI planner medication intake', () => {
  const content = buildOrderPlannerPrompt({
    paymentStatus: 'paid', tradeStatus: 'paid', refundStatus: 'none',
    serviceName: '医务代办-代配药服务', note: '希望下周送达',
  });
  assert.match(content, /药品通用名/);
  assert.match(content, /商品名\/品牌/);
  assert.match(content, /配药机构/);
  assert.match(content, /最终由健康规划师人工确认/);
  assert.match(content, /不会替您换药、改剂量/);
});

test('unpaid and refunding mall orders do not receive an order confirmation message', () => {
  assert.equal(buildOrderPlannerPrompt({ paymentStatus: 'pending', tradeStatus: 'awaiting_payment', serviceName: '待支付订单' }), '');
  assert.equal(buildOrderPlannerPrompt({ paymentStatus: 'paid', tradeStatus: 'paid', refundStatus: 'processing', serviceName: '退款订单' }), '');
});

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
