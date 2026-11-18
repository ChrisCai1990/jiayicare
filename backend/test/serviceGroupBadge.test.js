const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const inbox = require('../src/utils/messageInbox');

test('APNs unread summary includes group messages while keeping them out of the system inbox', async () => {
  const userId = 'patient-1';
  const groupNotice = { user: userId, unread: true, action: { type: 'service_group' } };
  assert.equal(inbox.visibleMessageQuery(userId, true)['action.type'].$ne, 'service_group');
  assert.deepEqual(inbox.unreadServiceGroupQuery(userId), {
    user: userId, unread: true, recalled: { $ne: true }, 'action.type': 'service_group',
  });
  assert.equal(groupNotice.action.type, 'service_group');

  const chain = rows => ({ select() { return this; }, sort() { return this; }, lean() { return Promise.resolve(rows); } });
  const Message = {
    find: () => chain([]),
    countDocuments: query => {
      assert.deepEqual(query, inbox.unreadServiceGroupQuery(userId));
      return Promise.resolve(1);
    },
  };
  const source = fs.readFileSync(require.resolve('../src/utils/getUnreadSummary'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(source, { module, require: name => ({
    '../models/Message': Message,
    '../models/PushRecord': { find: () => chain([]) },
    '../models/Order': {},
    '../models/DynamicQuestionnaire': { DynamicQuestionnaire: {}, QuestionnaireResponse: {} },
    './messageInbox': inbox,
  })[name] });
  const result = await module.exports.getUnreadSummary(userId);
  assert.equal(result.count, 1);
});
