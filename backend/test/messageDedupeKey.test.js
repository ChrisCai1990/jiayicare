const test = require('node:test');
const assert = require('node:assert/strict');
const Message = require('../src/models/Message');

test('普通连续聊天不写入唯一去重键', () => {
  const first = new Message({ user: '64b000000000000000000001', type: 'planner', sender: '嘉医管家', content: '第一条' });
  const second = new Message({ user: '64b000000000000000000001', type: 'planner', sender: '嘉医管家', content: '第二条' });
  assert.equal(first.toObject().dedupeKey, undefined);
  assert.equal(second.toObject().dedupeKey, undefined);
});

test('需要幂等的系统消息仍可显式写入去重键', () => {
  const message = new Message({
    user: '64b000000000000000000001', type: 'planner', sender: 'AI健康规划师', content: '订单确认',
    dedupeKey: 'order-planner-confirmation:123',
  });
  assert.equal(message.dedupeKey, 'order-planner-confirmation:123');
});
