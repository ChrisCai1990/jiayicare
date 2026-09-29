const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { CONTENT_REVIEW_OWNERS, canAccessContentReview } = require('../src/utils/contentReviewAccess');
const { advanceReview } = require('../src/utils/contentReviewWorkflow');
const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const actors = {
  jin: { _id: '6a28b59f441e73bd7deb3b87', role: 'familyDoctor', name: '金娟' },
  lan: { _id: CONTENT_REVIEW_OWNERS.familyDoctor, role: 'familyDoctor', name: '蓝戈文' },
  wu: { _id: CONTENT_REVIEW_OWNERS.nutritionist, role: 'nutritionist', name: '吴苗苗' },
  other: { _id: 'other', role: 'nutritionist', name: '其他营养师' },
  planner: { _id: 'planner', role: 'healthPlanner' },
  super: { _id: 'super', role: 'superadmin' },
};

test('professional GEO access belongs to verified accounts, never names or roles alone', () => {
  for (const who of ['lan', 'wu', 'planner', 'super']) assert.equal(canAccessContentReview(actors[who]), true);
  for (const who of ['jin', 'other']) assert.equal(canAccessContentReview(actors[who]), false);
  assert.equal(canAccessContentReview({ ...actors.jin, name: '蓝戈文' }), false);
  assert.equal(canAccessContentReview({ ...actors.lan, name: '新显示名' }), true);
  assert.equal(canAccessContentReview({ ...actors.wu, role: 'familyDoctor' }), false);
  assert.equal(canAccessContentReview({ ...actors.lan, staffStatus: 'inactive' }), false);
  assert.equal(canAccessContentReview(null), false);
});

function routes(model, ensure = async () => {}) {
  const handlers = {};
  const router = Object.fromEntries(['get', 'patch'].map(method => [method, (path, ...fns) => { handlers[method + path] = fns.at(-1); }]));
  vm.runInNewContext(source.slice(source.indexOf("router.get('/content-reviews'"), source.indexOf("router.get('/ai-todos'")), {
    router, staffAuth: () => {}, ContentReview: model, ensureContentReviews: ensure,
    canAccessContentReview, advanceReview, console,
    publishGeoArticle: () => { throw new Error('Publication must not run in this test'); },
  });
  return handlers;
}
async function call(handler, staff, body = {}, query = {}) {
  const result = { statusCode: 200 };
  const res = { status(n) { result.statusCode = n; return this; }, json(data) { result.body = data; return this; } };
  await handler({ staff, body, query, params: { id: 'draft' } }, res);
  return result;
}

test('actual list/history and mutation handlers deny non-owners before database access', async () => {
  const noDB = new Proxy({}, { get() { throw new Error('Unexpected database access'); } });
  const handlers = routes(noDB, () => { throw new Error('Unexpected seeding'); });
  for (const actor of [actors.jin, actors.other, { ...actors.lan, staffStatus: 'inactive' }]) {
    for (const query of [{}, { history: '1' }]) assert.equal((await call(handlers['get/content-reviews'], actor, {}, query)).statusCode, 403);
    for (const action of ['approve', 'return', 'publish']) assert.equal((await call(handlers['patch/content-reviews/:id/review'], actor, { action, note: 'test' })).statusCode, 403);
  }
});

test('designated owners see only their current review stage; history stays personally scoped', async () => {
  let query;
  const handlers = routes({ find(filter) { query = filter; return { sort() { return this; }, lean: async () => [] }; } });
  for (const actor of [actors.lan, actors.wu, actors.planner]) {
    assert.equal((await call(handlers['get/content-reviews'], actor)).statusCode, 200);
    assert.equal(query.currentRole, actor.role);
    await call(handlers['get/content-reviews'], actor, {}, { history: '1' });
    assert.ok(query.$or.every(condition => Object.values(condition)[0] === actor._id));
  }
});

test('real AI todo GEO aggregation skips non-owners and keeps correct owner stage', async () => {
  const start = source.indexOf('if (canAccessContentReview(req.staff)) {', source.indexOf("router.get('/ai-todos'"));
  const end = source.indexOf('// 会员归属过滤', start);
  assert.ok(start > 0 && end > start);
  for (const staff of Object.values(actors)) {
    const queries = [], todos = [];
    const ctx = { req: { staff }, role: staff.role, isSuper: staff.role === 'superadmin', todos, canAccessContentReview,
      ensureContentReviews: async () => {}, ContentReview: { find(q) { queries.push(q); return { sort() { return this; }, limit() { return this; }, lean: async () => [{ _id: 'draft', currentRole: staff.role, title: '测试稿' }] }; } } };
    await vm.runInNewContext('(async () => {' + source.slice(start, end) + '})()', ctx);
    assert.equal(todos.length, canAccessContentReview(staff) ? 1 : 0);
    if (queries.length && staff.role !== 'superadmin') assert.equal(queries[0].currentRole, staff.role);
  }
});

test('workflow forbids same-role outsiders and cross-stage spoofing without changing records', () => {
  const record = { currentRole: 'familyDoctor', status: 'pending', reviewChain: ['familyDoctor'], auditLog: [] };
  const before = JSON.stringify(record);
  assert.throws(() => advanceReview(record, 'familyDoctor', 'approve', '', actors.jin), /权限/);
  assert.throws(() => advanceReview(record, 'familyDoctor', 'approve', '', actors.wu), /权限/);
  assert.equal(JSON.stringify(record), before);
});

test('owners retain nutrition-to-advisor-to-planner transitions and reviewer audit', async () => {
  const record = { currentRole: 'nutritionist', status: 'pending', reviewChain: ['nutritionist', 'familyDoctor'], auditLog: [], save: async () => {} };
  const handlers = routes({ findById: async () => record });
  assert.equal((await call(handlers['patch/content-reviews/:id/review'], actors.wu, { action: 'approve' })).statusCode, 200);
  assert.equal(record.currentRole, 'familyDoctor');
  assert.equal(record.nutritionReview.reviewedBy, actors.wu._id);
  assert.equal((await call(handlers['patch/content-reviews/:id/review'], actors.lan, { action: 'approve' })).statusCode, 200);
  assert.equal(record.currentRole, 'healthPlanner');
  assert.equal(record.status, 'ready_to_publish');
  assert.equal(record.doctorReview.reviewedBy, actors.lan._id);
  assert.equal(record.auditLog.length, 2);
});
