const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeText, hasEmergency, hasMedicalDetail, safeConversation } = require('../src/utils/visitorAssistantSafety');

test('visitor assistant blocks emergency and medical details', () => {
  assert.equal(hasEmergency('突发胸痛，呼吸困难'), true);
  assert.equal(hasMedicalDetail('我的血脂指标高，需要怎么用药'), true);
  assert.equal(hasMedicalDetail('我想做体重管理'), false);
});

test('visitor assistant trims untrusted conversation input', () => {
  assert.equal(normalizeText('  咨询\n体重管理  ', 30), '咨询 体重管理');
  const messages = safeConversation(Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `第${i}条` })));
  assert.equal(messages.length, 6);
  assert.equal(messages[0].content, '第2条');
});
