const test = require('node:test');
const assert = require('node:assert/strict');
const { forCustomer } = require('./groupCustomerMentionDisplay');

test('客户消息和引用隐藏旧版客户角色标注，保留医护角色', () => {
  const message = { content: '@潘孝成（客户） 您好，@金娟（健康顾问）', quote: { content: '@潘孝成（客户） 早上好' } };
  assert.deepEqual(forCustomer(message, '潘孝成'), {
    content: '@潘孝成 您好，@金娟（健康顾问）', quote: { content: '@潘孝成 早上好' },
  });
  assert.equal(message.content, '@潘孝成（客户） 您好，@金娟（健康顾问）');
});
