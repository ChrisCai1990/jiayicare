/**
 * Replace the legacy sparse unique sourceOrderId index. Manual supplements
 * explicitly store null, which sparse indexes still include.
 *
 * Preview: node scripts/fix-supplement-source-order-index.js
 * Apply:   node scripts/fix-supplement-source-order-index.js --apply
 */
require('dotenv').config();
const mongoose = require('mongoose');

const OLD_NAME = 'sourceOrderId_1';
const NEW_NAME = 'sourceOrderId_objectId_unique';
const KEY = { sourceOrderId: 1 };
const FILTER = { sourceOrderId: { $type: 'objectId' } };

function isExpectedNewIndex(index) {
  return index?.name === NEW_NAME && index.unique === true
    && index.key?.sourceOrderId === 1
    && index.partialFilterExpression?.sourceOrderId?.$type === 'objectId';
}

async function migrate(collection, apply = false) {
  const indexes = await collection.indexes();
  const oldIndex = indexes.find(index => index.name === OLD_NAME);
  const newIndex = indexes.find(index => index.name === NEW_NAME);
  if (oldIndex && !(oldIndex.unique === true && oldIndex.sparse === true
    && oldIndex.key?.sourceOrderId === 1 && Object.keys(oldIndex.key).length === 1)) {
    throw new Error(`${OLD_NAME} 与预期旧索引不符，请人工核对`);
  }
  if (newIndex && !isExpectedNewIndex(newIndex)) {
    throw new Error(`${NEW_NAME} 与预期新索引不符，请人工核对`);
  }

  const duplicateOrderIds = await collection.aggregate([
    { $match: FILTER },
    { $group: { _id: '$sourceOrderId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).toArray();
  if (duplicateOrderIds.length) throw new Error('存在重复的订单关联营养素，停止迁移');

  const report = { mode: apply ? 'apply' : 'dry-run', oldIndex: !!oldIndex,
    newIndex: !!newIndex, nullOrMissingSourceOrderRecords: await collection.countDocuments({ sourceOrderId: null }) };
  if (!apply) return report;

  // Keep the old constraint in place until the replacement is ready.
  if (!newIndex) await collection.createIndex(KEY, { name: NEW_NAME, unique: true, partialFilterExpression: FILTER });
  if (oldIndex) await collection.dropIndex(OLD_NAME);
  const finalIndexes = await collection.indexes();
  if (!isExpectedNewIndex(finalIndexes.find(index => index.name === NEW_NAME))
    || finalIndexes.some(index => index.name === OLD_NAME)) {
    throw new Error('索引迁移后核验失败');
  }
  return { ...report, migrated: true };
}

async function main() {
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const report = await migrate(mongoose.connection.db.collection('supplements'), process.argv.includes('--apply'));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { migrate };
