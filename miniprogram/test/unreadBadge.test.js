const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  let token = 'user-token';
  const requests = []; const badges = [];
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/unreadBadge.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const ctx = { loadToken: () => token, messagesAPI: { unreadCount: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) },
    Taro: { setTabBarBadge: ({ text }) => { badges.push(text); return Promise.resolve(); }, removeTabBarBadge: () => { badges.push('0'); return Promise.resolve(); }, showToast() {} } };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  return { ctx, requests, badges, logout: () => { token = null; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('older count response cannot restore a badge cleared by a newer response', async () => {
  const h = harness(); const old = h.ctx.refreshUnreadBadge(); const latest = h.ctx.refreshUnreadBadge();
  h.requests[1].resolve({ success: true, count: 0 }); await latest;
  h.requests[0].resolve({ success: true, count: 1 }); await old;
  assert.deepEqual(h.badges, ['0']);
});

test('reading invalidates in-flight counts and polling waits for read persistence', async () => {
  const h = harness(); const old = h.ctx.refreshUnreadBadge(); let finishRead;
  const read = h.ctx.withUnreadBadgeUpdate(() => new Promise(resolve => { finishRead = resolve; }));
  await h.ctx.refreshUnreadBadge(); assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ success: true, count: 1 }); await old; assert.deepEqual(h.badges, []);
  finishRead(); await read;
  h.requests[1].resolve({ success: true, count: 0 }); await settle();
  assert.deepEqual(h.badges, ['0']);
});

test('network failure retains the confirmed badge; logout prevents stale restoration', async () => {
  const h = harness(); let pending = h.ctx.refreshUnreadBadge(); h.requests[0].resolve({ success: true, count: 2 }); await pending;
  pending = h.ctx.refreshUnreadBadge(); h.requests[1].reject(new Error('offline')); await pending;
  assert.deepEqual(h.badges, ['2']);
  pending = h.ctx.refreshUnreadBadge(); h.logout(); await h.ctx.resetUnreadBadge();
  h.requests[2].resolve({ success: true, count: 5 }); await pending;
  assert.deepEqual(h.badges, ['2', '0']);
});

test('guest browsing does not call protected unread API', async () => {
  const h = harness(); h.logout(); await h.ctx.refreshUnreadBadge();
  assert.equal(h.requests.length, 0); assert.deepEqual(h.badges, ['0']);
});
