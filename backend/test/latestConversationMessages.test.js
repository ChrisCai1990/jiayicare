const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readRoute = (name) => fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', name), 'utf8');

test('用户端和医护端会话均先取最新100条再恢复为时间正序', () => {
  for (const routeName of ['messages.js', 'staff.js']) {
    const source = readRoute(routeName);
    assert.match(source, /const \[newestMessages, state\] = await Promise\.all/);
    assert.match(source, /sort\(\{ createdAt: -1 \}\)\.limit\(100\)/);
    assert.match(source, /const messages = newestMessages\.reverse\(\)/);
  }
});
