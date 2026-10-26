const test = require('node:test');
const assert = require('node:assert/strict');
const Supplement = require('../src/models/Supplement');
const { migrate } = require('../scripts/fix-supplement-source-order-index');

const NEW_NAME = 'sourceOrderId_objectId_unique';
const old = { name: 'sourceOrderId_1', key: { sourceOrderId: 1 }, unique: true, sparse: true };
const replacement = { name: NEW_NAME, key: { sourceOrderId: 1 }, unique: true,
  partialFilterExpression: { sourceOrderId: { $type: 'objectId' } } };

function collection(initial = [old]) {
  const indexes = [...initial];
  const calls = [];
  return {
    calls,
    indexes: async () => indexes.map(index => ({ ...index })),
    aggregate: () => ({ toArray: async () => [] }),
    countDocuments: async () => 1,
    createIndex: async (key, options) => {
      calls.push('create');
      indexes.push({ key, ...options });
    },
    dropIndex: async name => {
      calls.push('drop');
      indexes.splice(indexes.findIndex(index => index.name === name), 1);
    },
  };
}

test('manual supplement can have a null sourceOrderId outside the unique partial index', () => {
  const document = new Supplement({ user: '507f1f77bcf86cd799439011', name: '益生菌', dosage: '1粒', frequency: '每日1次' });
  assert.equal(document.sourceOrderId, null);
  const [, options] = Supplement.schema.indexes().find(([key]) => key.sourceOrderId === 1);
  assert.deepEqual(options.partialFilterExpression, { sourceOrderId: { $type: 'objectId' } });
  assert.equal(options.unique, true);
  assert.equal(options.sparse, undefined);
});

test('migration previews, creates the replacement before dropping the legacy index, and is repeatable', async () => {
  const db = collection();
  assert.equal((await migrate(db)).mode, 'dry-run');
  assert.deepEqual(db.calls, []);
  assert.equal((await migrate(db, true)).migrated, true);
  assert.deepEqual(db.calls, ['create', 'drop']);
  await migrate(db, true);
  assert.deepEqual(db.calls, ['create', 'drop']);
});

test('migration refuses an unexpected old index', async () => {
  const db = collection([{ ...old, sparse: false }]);
  await assert.rejects(migrate(db, true), /预期旧索引不符/);
  assert.deepEqual(db.calls, []);
});
