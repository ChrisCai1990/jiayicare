const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(fail = false) {
  const routes = [];
  const router = new Proxy({}, { get: (_, method) => (path, ...handlers) => routes.push({method, path, handlers}) });
  const auth = () => {};
  const calls = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/routes/user'), 'utf8'), {
    module: {exports: {}}, process: {env: {}}, console: {error() {}}, Buffer,
    require: key => key === 'express' ? {Router: () => router} : key === '../middleware/auth' ? auth : key === '../utils/membershipBenefits' ? {
      membershipBenefits: async user => { calls.push(user); if (fail) throw Error('private database error'); return {plans: [], message: 'none'}; },
    } : {},
  });
  const route = routes.find(r => r.method === 'get' && r.path === '/membership-benefits');
  assert.ok(route, 'released mini program API must remain registered');
  assert.equal(route.handlers[0], auth);
  return {handler: route.handlers.at(-1), calls};
}
test('membership route is authenticated and only uses current customer', async () => {
  const {handler, calls} = fixture();
  const user = {_id: 'self'};
  let payload;
  await handler({user, query: {userId: 'other'}}, {json: value => {payload = value;}});
  assert.equal(calls[0], user);
  assert.equal(payload.success, true);
  assert.equal(payload.data.plans.length, 0);
});
test('membership errors are explicit and do not leak database messages', async () => {
  const {handler} = fixture(true);
  let status, payload;
  const res = {status: value => {status = value; return res;}, json: value => {payload = value;}};
  await handler({user: {_id: 'self'}}, res);
  assert.equal(status, 500);
  assert.equal(payload.success, false);
  assert.ok(!payload.message.includes('private'));
});
