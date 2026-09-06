const test = require('node:test');
const assert = require('node:assert/strict');
const { customerOrderNote } = require('../src/utils/orderPlannerConversation');

test('planner prompt keeps customer requirements and removes settlement metadata', () => {
  assert.equal(customerOrderNote('规格：基础版；周五上午；健康基金抵扣¥25；支付方式：wechat_pay'), '规格：基础版；周五上午');
});

test('planner prompt supports an order without time or notes', () => {
  assert.equal(customerOrderNote('健康基金抵扣¥200'), '');
});
