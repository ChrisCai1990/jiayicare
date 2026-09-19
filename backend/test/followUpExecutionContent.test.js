const test = require('node:test');
const assert = require('node:assert/strict');
const { executionContent } = require('../src/utils/followUpExecutionContent');
test('staff form content is the execution conclusion', () => {
  assert.equal(executionContent({ content: 'reviewed' }), 'reviewed');
  assert.equal(executionContent({ content: 'current', executedContent: 'old' }), 'current');
});
test('legacy execution field is accepted only when content is omitted', () => {
  assert.equal(executionContent({ executedContent: 'legacy' }), 'legacy');
  assert.equal(executionContent({}), undefined);
});
test('blank explicit conclusions cannot be replaced by stale legacy values', () => {
  for (const content of ['', null, '  ']) assert.equal(executionContent({ content, executedContent: 'old' }), content);
});
