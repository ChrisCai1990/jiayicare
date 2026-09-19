const test = require('node:test');
const assert = require('node:assert/strict');
const Message = require('../src/models/Message');
const Order = require('../src/models/Order');
const { customerOrderNote, extractExplicitServiceTime, buildOrderPlannerPrompt, latestOpenOrderConversationAction, isNutritionDeliveryOrder, ensureOrderPlannerPrompt } = require('../src/utils/orderPlannerConversation');

test('planner prompt keeps customer requirements and removes settlement metadata', () => {
  assert.equal(customerOrderNote('规格：基础版；周五上午；健康基金抵扣¥25；支付方式：wechat_pay'), '规格：基础版；周五上午');
  assert.equal(extractExplicitServiceTime('希望周五上午安排'), '周五');
});
test('nutrition delivery orders receive warehouse and address copy after payment', () => {
  const content = buildOrderPlannerPrompt({
    paymentStatus: 'paid', tradeStatus: 'paid', refundStatus: 'none',
    fulfillmentType: 'delivery_and_service', serviceName: '营养补充产品',
  });
  assert.match(content, /支付已确认/);
  assert.match(content, /仓库安排发货/);
  assert.match(content, /收货人、联系电话和详细收货地址/);
  assert.doesNotMatch(content, /期望时间|确认具体服务内容|已发货|已经发货/);
});

test('confirmed meal replacement and supplement workflows override legacy offline-service copy only', () => {
  for (const product of [
    { serviceName: '营养改变生活', serviceWorkflowSnapshot: { key: 'nutrition_intervention' } },
    { serviceName: '维生素D（UGN）', serviceWorkflowSnapshot: { key: 'supplement_supply' } },
    { serviceName: '纾炏宁®口溶粉', serviceWorkflowSnapshot: { key: 'supplement_supply' } },
  ]) {
    const order = { ...product, paymentStatus: 'paid', tradeStatus: 'paid', status: 'pending', fulfillmentType: 'offline_service' };
    const before = JSON.stringify(order);
    assert.match(buildOrderPlannerPrompt(order), /仓库安排发货/);
    assert.equal(JSON.stringify(order), before, 'copy selection must not change the order');
  }
});

test('nutrition consultations and other appointments keep service confirmation copy', () => {
  for (const serviceName of ['营养评估服务', '科学减重咨询', '体检服务']) {
    const order = { serviceName, paymentStatus: 'paid', tradeStatus: 'paid', status: 'pending', fulfillmentType: 'remote_service', serviceWorkflowSnapshot: { key: 'nutrition_intervention' }, note: '了解营养补充和代餐' };
    assert.equal(isNutritionDeliveryOrder(order), false);
    assert.match(buildOrderPlannerPrompt(order), /确认具体服务内容/);
    assert.doesNotMatch(buildOrderPlannerPrompt(order), /仓库/);
  }
  assert.match(buildOrderPlannerPrompt({ serviceName: '普通商品', paymentStatus: 'paid', tradeStatus: 'paid', fulfillmentType: 'delivery_and_service' }), /后续服务或交付安排/);
});

test('nutrition physical orders preserve payment/refund guards and message idempotency', async () => {
  for (const state of [{ paymentStatus: 'pending', tradeStatus: 'awaiting_payment' }, { paymentStatus: 'paid', tradeStatus: 'paid', refundStatus: 'processing' }]) {
    assert.equal(buildOrderPlannerPrompt({ serviceName: '营养改变生活', ...state }), '');
  }
  const find = Message.findOne; const create = Message.create;
  try {
    const existing = { _id: 'existing', content: '历史订单原话术' };
    Message.findOne = async () => existing;
    Message.create = async () => { throw Error('must not resend or overwrite history'); };
    assert.equal(await ensureOrderPlannerPrompt({ _id: 'order', user: 'user', serviceName: '营养改变生活', paymentStatus: 'paid', tradeStatus: 'paid' }), existing);
  } finally { Message.findOne = find; Message.create = create; }
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
