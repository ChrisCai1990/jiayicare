const test = require('node:test');
const assert = require('node:assert/strict');
const { insertAnnualOnce } = require('../src/utils/annualDispatchOnce');
const indexed = model => ({ ...model, init: async () => {}, collection: { indexes: async () => [{ key: { annualDispatchKey: 1 }, unique: true, sparse: true }] } });

test('并发首次派发仅一条插入，竞争者复用稳定键，不覆盖执行状态', async () => {
  let saved; let arrivals = 0; let release;
  const bothArrived = new Promise(resolve => { release = resolve; });
  const Model = indexed({
    updateOne: async (filter, update, options) => {
      assert.equal(options.upsert, true); assert.deepEqual(Object.keys(update), ['$setOnInsert']);
      if (++arrivals === 2) release(); await bothArrived;
      if (saved) throw Object.assign(Error('duplicate'), { code: 11000, keyPattern: { annualDispatchKey: 1 } });
      saved = { ...update.$setOnInsert, status: 'completed' }; return { upsertedCount: 1 };
    }, exists: async () => saved,
  });
  const run = () => insertAnnualOnce(Model, { _id: 'plan' }, 'scheduled', 'row', { sourceScheduleKey: 'row' }, { status: 'planned' });
  const results = await Promise.all([run(), run()]);
  assert.equal(results.reduce((sum, r) => sum + r.upsertedCount, 0), 1);
  assert.equal(saved.status, 'completed'); assert.equal(saved.annualDispatchKey.length, 64);
});
test('不同项目/方案不共用派发键，其他唯一约束错误不被吞掉', async () => {
  const keys = [];
  const Model = indexed({ updateOne: async (q, u) => { keys.push(u.$setOnInsert.annualDispatchKey); return {}; } });
  for (const [plan, kind, row] of [['a', 'client', 'x'], ['a', 'scheduled', 'x'], ['b', 'client', 'x'], ['a', 'client', 'y']]) await insertAnnualOnce(Model, { _id: plan }, kind, row, {}, {});
  assert.equal(new Set(keys).size, 4);
  for (const error of [Object.assign(Error('unrelated duplicate'), { code: 11000, keyPattern: { phone: 1 } }), Error('database down')]) {
    await assert.rejects(insertAnnualOnce(indexed({ updateOne: async () => { throw error; } }), { _id: 'p' }, 't', 'k', {}, {}), error);
  }
});
test('实际数据库缺唯一索引时阻止派发，建好后允许重试', async () => {
  let ready = false; let writes = 0;
  const Model = { init: async () => {}, collection: { indexes: async () => ready ? [{ key: { annualDispatchKey: 1 }, unique: true, sparse: true }] : [] }, updateOne: async () => { writes++; return {}; } };
  await assert.rejects(insertAnnualOnce(Model, { _id: 'p' }, 'kind', 'key', {}, {}), { code: 'ANNUAL_DISPATCH_INDEX_REQUIRED' });
  assert.equal(writes, 0); ready = true;
  await insertAnnualOnce(Model, { _id: 'p' }, 'kind', 'key', {}, {});
  assert.equal(writes, 1);
});
test('各承接模型启用稀疏唯一索引，不为历史记录补空键', () => {
  for (const name of ['Task', 'FollowUp', 'Medication', 'Supplement', 'RecurringSupplyPlan']) {
    const Model = require(`../src/models/${name}`);
    assert.equal(new Model().annualDispatchKey, undefined);
    const index = Model.schema.indexes().find(([keys]) => keys.annualDispatchKey);
    assert.equal(index[1].unique, true); assert.equal(index[1].sparse, true);
  }
});
