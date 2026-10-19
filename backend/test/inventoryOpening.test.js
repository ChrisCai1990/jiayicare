const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/routes/inventory'), 'utf8');
const start = source.indexOf("adminRouter.post('/products/:id/enable'");
const end = source.indexOf("adminRouter.patch('/products/:id/settings'", start);

async function enable(body, { oldStock = 1000, failEntry = false } = {}) {
  let changed;
  let opening;
  let rollback;
  const product = { _id:'product', stock:oldStock, stockLimited:false, inventoryTracking:{ enabled:false } };
  let handler;
  const Product = {
    findOne: async () => product,
    findOneAndUpdate: async (filter, update) => {
      assert.equal(filter.stock, oldStock);
      changed = update.$set;
      return { ...product, ...changed };
    },
    updateOne: async (filter, update) => { rollback = { filter, update }; },
  };
  const InventoryEntry = { create: async row => { opening = row; if (failEntry) throw Error('ledger unavailable'); } };
  vm.runInNewContext(source.slice(start, end), {
    adminRouter: { post: (_path, callback) => { handler = callback; } },
    validId: () => true,
    tenant: () => 'tenant',
    actor: () => ({ _id:'admin' }),
    bad: (res, message, status = 400) => res.status(status).json({ message }),
    Product, InventoryEntry,
  });
  const res = { code:200, status(code) { this.code = code; return this; }, json(payload) { this.body = payload; return this; } };
  const req = { params:{ id:'product' }, body, admin:{ _id:'admin', tenantId:'tenant' } };
  let error;
  try { await handler(req, res); } catch (caught) { error = caught; }
  return { res, changed, opening, rollback, error };
}

test('opening stock requires an actual count and counting evidence', async () => {
  for (const body of [{}, { openingQuantity:'', openingNote:'清点' }, { openingQuantity:null, openingNote:'清点' }, { openingQuantity:0, openingNote:'' }]) {
    const result = await enable(body);
    assert.equal(result.res.code, 400);
    assert.equal(result.changed, undefined);
  }
});

test('an arbitrary mall stock is replaced by the physical opening count', async () => {
  const { res, changed, opening } = await enable({ openingQuantity:7, openingNote:'库房逐件清点' });
  assert.equal(res.code, 200);
  assert.equal(changed.stock, 7);
  assert.equal(changed.stockLimited, true);
  assert.equal(opening.quantity, 7);
  assert.equal(opening.balanceAfter, 7);
  assert.match(opening.note, /原商城展示库存 1000 未核实/);
});

test('a failed opening ledger write attempts to restore the former mall stock', async () => {
  const { error, rollback } = await enable({ openingQuantity:7, openingNote:'清点' }, { failEntry:true });
  assert.match(error.message, /ledger unavailable/);
  assert.equal(rollback.update.$set.stock, 1000);
  assert.equal(rollback.update.$set.inventoryTracking.enabled, false);
});

test('legacy opening remains unverified until a later physical count', async () => {
  const listStart = source.indexOf('async function list(req, res)');
  const listEnd = source.indexOf("adminRouter.get('/', list)", listStart);
  const products = [{ _id:'uncounted', stock:1008 }, { _id:'counted', stock:129 }];
  const openings = [
    { productId:'uncounted', createdAt:new Date('2026-10-19T10:00:00Z') },
    { productId:'counted', createdAt:new Date('2026-10-19T10:00:00Z') },
  ];
  const counts = [{ productId:'counted', createdAt:new Date('2026-10-19T10:01:00Z') }];
  const chain = rows => ({ select: () => ({ lean: async () => rows }), sort: () => ({ lean: async () => rows, limit: () => ({ populate: () => ({ populate: () => ({ lean: async () => rows }) }) }) }) });
  const context = {
    Product: { find: () => ({ select: () => ({ sort: () => ({ lean: async () => products }) }) }) },
    InventoryEntry: { find: filter => chain(filter.type === 'opening' ? openings : filter.type === 'count' ? counts : []) },
    productFilter: () => ({}), tenant: () => 'tenant',
  };
  const list = vm.runInNewContext(`${source.slice(listStart, listEnd)}; list`, context);
  const res = { json(payload) { this.body = payload; } };
  await list({}, res);
  assert.equal(res.body.data.products[0].needsOpeningCount, true);
  assert.equal(res.body.data.products[1].needsOpeningCount, false);
});
