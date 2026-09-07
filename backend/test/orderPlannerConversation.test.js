const test = require('node:test');
const assert = require('node:assert/strict');
const { customerOrderNote, extractExplicitServiceTime } = require('../src/utils/orderPlannerConversation');

test('planner prompt keeps customer requirements and removes settlement metadata', () => {
  assert.equal(customerOrderNote('规格：基础版；周五上午；健康基金抵扣¥25；支付方式：wechat_pay'), '规格：基础版；周五上午');
});

test('planner prompt supports an order without time or notes', () => {
  assert.equal(customerOrderNote('健康基金抵扣¥200'), '');
});

test('AI确认仅提取备注中明确出现的相对时间', () => {
  assert.equal(extractExplicitServiceTime('希望能一周内安排陪检'), '一周内');
  assert.equal(extractExplicitServiceTime('尽快安排陪检'), '');
});
