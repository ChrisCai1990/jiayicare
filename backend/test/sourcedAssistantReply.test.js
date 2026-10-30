const test = require('node:test');
const assert = require('node:assert/strict');
const replies = require('../src/utils/sourcedAssistantReply');

test('an earlier health question does not turn later greetings into a fixed referral', async () => {
  for (const latest of ['你好', '现在可以了吗']) {
    let calls = 0;
    const answer = await replies.generate([
      { role: 'user', content: '我的血压最近偏高，怎么办？' },
      { role: 'assistant', content: replies.REFER },
      { role: 'user', content: latest },
    ], 'test', async (_messages, options) => {
      calls++;
      assert.doesNotMatch(options.systemPrompt, /who-bmi|who-activity|who-diet/);
      return JSON.stringify({ kind: 'social', content: '在的，您说。' });
    });
    assert.equal(calls, 1);
    assert.equal(answer.content, '在的，您说。');
  }
});

test('a new personal health question still receives the professional referral', async () => {
  let calls = 0;
  const answer = await replies.generate([
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '在的，您说。' },
    { role: 'user', content: '我的血压最近偏高，怎么办？' },
  ], 'test', async () => { calls++; return ''; });
  assert.equal(calls, 0);
  assert.equal(answer.content, replies.REFER);
});
