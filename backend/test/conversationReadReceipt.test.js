const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/messages.js'), 'utf8');

test('opening a conversation persists the customer read time for team messages', () => {
  const threadRoute = source.slice(source.indexOf("router.get('/thread/:role'"), source.indexOf("router.post('/nutrition-analysis'"));
  assert.match(threadRoute, /type: \{ \$ne: 'user' \}, unread: true/);
  assert.match(threadRoute, /\{ unread: false, readAt: new Date\(\) \}/);
  assert.match(threadRoute, /if \(message\.type !== 'user'\)/);
});
