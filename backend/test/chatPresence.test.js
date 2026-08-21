const test = require('node:test');
const assert = require('node:assert/strict');

const { isHumanPresent, humanPresentQuery } = require('../src/utils/chatPresence');

test('近期人工心跳显示人工服务中', () => {
  const now = new Date('2026-08-21T05:00:00.000Z');
  assert.equal(isHumanPresent({ humanActive: true, takenOverAt: new Date(now - 30000) }, now), true);
});

test('遗留接手状态超过时限后自动视为AI承接', () => {
  const now = new Date('2026-08-21T05:00:00.000Z');
  assert.equal(isHumanPresent({ humanActive: true, takenOverAt: new Date(now - 91000) }, now), false);
  assert.deepEqual(humanPresentQuery('u_doctor', now), {
    conversationId: 'u_doctor', humanActive: true, takenOverAt: { $gte: new Date(now - 90000) },
  });
});
