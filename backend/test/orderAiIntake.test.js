const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeIntakeResult } = require('../src/utils/orderPlannerConversation');

test('三项信息齐全后才进入人工确认', () => {
  assert.equal(normalizeIntakeResult({ serviceTime: '周三' }).status, 'in_progress');
  const result = normalizeIntakeResult({ serviceTime: '周三', serviceContent: '陪同体检', customerNeed: '协助长辈完成检查' });
  assert.equal(result.status, 'ready_for_review');
  assert.deepEqual(result.missingFields, []);
});

test('风险信息进入人工补充且不自动推进履约', () => {
  const result = normalizeIntakeResult({ serviceTime: '今天', serviceContent: '就医协助', customerNeed: '胸痛', riskFlags: ['紧急症状'] });
  assert.equal(result.status, 'needs_attention');
});
