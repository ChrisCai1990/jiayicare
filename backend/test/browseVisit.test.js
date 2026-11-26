const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/auth.js'), 'utf8');
function fixture() {
  let handler, write;
  const guard = () => {};
  const router = { get() {}, post(route, ...args) {
    if (route === '/browse-visit') { assert.equal(args[0], guard); handler = args[1]; }
  }};
  const mocks = {
    express: { Router: () => router }, '../middleware/auth': guard,
    '../models/User': { updateOne: async (query, update) => { write = { query, update }; } },
    '../models/Product': { findOne: () => ({ select: () => ({ lean: async () => ({ name: '测试商品' }) }) }) },
  };
  vm.runInNewContext(source, { require: name => mocks[name] || {}, module: { exports: {} } });
  return async body => {
    let status = 200;
    await handler({ body, user: { _id: 'member', tenantId: 'tenant' } }, { status(n) { status = n; return this; }, json() {} });
    return { status, write };
  };
}
test('authenticated views are bounded, retry-safe and take product names from the catalog', async () => {
  const { write } = await fixture()({ page: 'product', productId: 'a'.repeat(24), eventId: 'test-event', client: 'weapp', title: 'arbitrary', userId: 'different' });
  assert.equal(write.query._id, 'member');
  assert.equal(write.query['recentBrowseVisits.eventId'].$ne, 'test-event');
  assert.equal(write.update.$push.recentBrowseVisits.$slice, 50);
  assert.equal(write.update.$push.recentBrowseVisits.$each[0].title, '商品或服务详情 · 测试商品');
});
test('health pages store the category only, unknown pages are rejected', async () => {
  const payload = { page: 'reports', productId: 'a'.repeat(24), eventId: 'test-event', client: 'ios', title: 'private' };
  const { write } = await fixture()(payload);
  assert.equal(write.update.$push.recentBrowseVisits.$each[0].title, '健康报告');
  assert.equal((await fixture()({ ...payload, page: 'private' })).status, 400);
});
