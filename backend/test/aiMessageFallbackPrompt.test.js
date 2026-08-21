const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSystemPrompt } = require('../src/utils/aiMessageFallback');

test('首次回复允许自然称呼，但不强制固定开头', () => {
  const prompt = buildSystemPrompt(true, '金老师');

  assert.match(prompt, /可以自然称呼一次"金老师"/);
  assert.match(prompt, /也可以不称呼/);
  assert.doesNotMatch(prompt, /开口称呼用户/);
});

test('连续回复默认省略称呼并避免机械化表达', () => {
  const prompt = buildSystemPrompt(false, '金老师');

  assert.match(prompt, /连续对话，默认不要再称呼"金老师"/);
  assert.match(prompt, /避免固定的“回应一下＋再追问一句”模板/);
  assert.match(prompt, /不必强行开启新话题/);
});
