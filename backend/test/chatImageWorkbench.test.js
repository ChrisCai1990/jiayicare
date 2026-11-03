const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const start = source.indexOf("    if (can('chat_image_review')) {", source.indexOf("router.get('/ai-todos'"));
const end = source.indexOf("    if (can('annual_plan_customer_response')) {", start);
const projection = source.slice(start, end);

async function pendingTodos({ messages, archivedIds = [], allowed = true }) {
  const todos = [];
  const patientId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const context = {
    can: () => allowed,
    myPatientIds: [patientId],
    Message: { find: filter => ({ select: () => ({ populate: () => ({ lean: async () => {
      assert.equal(filter.materialDisposition.$ne, 'excluded');
      assert.deepEqual(filter.user.$in, [patientId]);
      return messages.filter(message => message.materialDisposition !== 'excluded' && !message.recalled);
    } }) }) }) },
    MedicalReport: { find: () => ({ select: () => ({ lean: async () => archivedIds.map(sourceChatMessageId => ({ sourceChatMessageId })) }) }) },
    todos, now: new Date('2026-11-03T12:00:00Z'), DAY: 86400000, Set, String, Date,
  };
  await vm.runInNewContext(`(async () => { ${projection} })()`, context);
  return todos;
}

test('each unresolved chat image remains a manager task after the message is read', async () => {
  const id = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  const todos = await pendingTodos({ messages: [{ _id: id, user: { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: '测试客户' }, content: '图片记录', createdAt: new Date('2026-11-01T12:00:00Z'), staffReadAt: new Date() }] });
  assert.equal(todos.length, 1);
  assert.equal(todos[0].type, 'chat_image_review');
  assert.equal(todos[0].overdue, true);
  assert.match(todos[0].link, new RegExp(`chatImageId=${id}$`));
});

test('excluded, recalled and archived images do not create manager tasks', async () => {
  const messages = ['b', 'c', 'd'].map((letter, index) => ({ _id: letter.repeat(24), user: { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: '测试客户' }, createdAt: new Date(), ...(index === 0 ? { materialDisposition: 'excluded' } : index === 1 ? { recalled: true } : {}) }));
  assert.equal((await pendingTodos({ messages, archivedIds: [messages[2]._id] })).length, 0);
  assert.equal((await pendingTodos({ messages, allowed: false })).length, 0);
});
