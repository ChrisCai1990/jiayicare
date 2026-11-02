const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('retired chat draft tasks and actions are absent from staff UI', () => {
  const root = path.resolve(__dirname, '../src');
  for (const file of ['api.js', 'components/AiTodosPanel.jsx', 'pages/NotificationsPage.jsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /generateChatFollowupDraft|resolveChatFollowupFailure|chat_followup_failed|营养聊天草稿需处理/);
  }
});
