const test = require('node:test');
const assert = require('node:assert/strict');

const { isHumanPresent, humanPresentQuery } = require('../src/utils/chatPresence');

test('人工接手状态显示人工服务中', () => {
  assert.equal(isHumanPresent({ humanActive: true, takenOverAt: new Date('2020-01-01') }), true);
});

test('人工接手不随时间失效，直到明确退出', () => {
  assert.equal(isHumanPresent({ humanActive: false, takenOverAt: new Date('2020-01-01') }), false);
  assert.deepEqual(humanPresentQuery('u_doctor'), { conversationId: 'u_doctor', humanActive: true });
});
