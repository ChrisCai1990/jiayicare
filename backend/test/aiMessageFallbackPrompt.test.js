const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSystemPrompt, stripRepeatedOpeningTitle } = require('../src/utils/aiMessageFallback');

test('首次回复允许自然称呼，但不强制固定开头', () => {
  const prompt = buildSystemPrompt(true, '金老师');

  assert.match(prompt, /可以自然称呼一次"金老师"/);
  assert.match(prompt, /也可以不称呼/);
  assert.doesNotMatch(prompt, /开口称呼用户/);
});

test('连续回复硬性移除开头重复称呼', () => {
  assert.equal(stripRepeatedOpeningTitle('金老师，明白了，就是测试一下 😊', false, '金老师'), '明白了，就是测试一下 😊');
  assert.equal(stripRepeatedOpeningTitle('金老师：不用着急。', false, '金老师'), '不用着急。');
  assert.equal(stripRepeatedOpeningTitle('这次不需要处理，放心吧。', false, '金老师'), '这次不需要处理，放心吧。');
  assert.equal(stripRepeatedOpeningTitle('金老师，第一次见面您好。', true, '金老师'), '金老师，第一次见面您好。');
  assert.equal(stripRepeatedOpeningTitle('[2026/8/21 13:29:34] 金老师，明白了。', false, '金老师'), '明白了。');
});

test('明确要求接受“只是测试”的最新事实', () => {
  const prompt = buildSystemPrompt(false, '金老师');
  assert.match(prompt, /只是测试/);
  assert.match(prompt, /不要继续追问重点/);
});

test('连续回复默认省略称呼并避免机械化表达', () => {
  const prompt = buildSystemPrompt(false, '金老师');

  assert.match(prompt, /连续对话，默认不要再称呼"金老师"/);
  assert.match(prompt, /避免固定的“回应一下＋再追问一句”模板/);
  assert.match(prompt, /不必强行开启新话题/);
});
