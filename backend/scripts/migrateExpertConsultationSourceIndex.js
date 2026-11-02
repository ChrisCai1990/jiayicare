/** Make order linkage unique only for order initiated consultation cases.
 * Preview: node scripts/migrateExpertConsultationSourceIndex.js
 * Apply:   node scripts/migrateExpertConsultationSourceIndex.js --apply
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const KEY = { tenantId: 1, orderId: 1 };
const NEW_NAME = 'tenant_order_unique_objectId';
const FILTER = { orderId: { $type: 'objectId' } };

function matchesKey(index) {
  return index?.key?.tenantId === 1 && index?.key?.orderId === 1 && Object.keys(index.key).length === 2;
}

async function migrate(collection, apply = false) {
  const indexes = await collection.indexes();
  const legacy = indexes.filter(index => matchesKey(index) && index.unique && index.name !== NEW_NAME);
  if (legacy.some(index => !['tenant_order_unique', 'tenantId_1_orderId_1'].includes(index.name)
    || index.partialFilterExpression)) throw new Error('发现未知的旧订单唯一索引，请先人工核对');
  const replacement = indexes.find(index => index.name === NEW_NAME);
  if (replacement && (!matchesKey(replacement) || !replacement.unique
    || replacement.partialFilterExpression?.orderId?.$type !== 'objectId'))
    throw new Error('新索引与预期不符，请先人工核对');
  const duplicate = await collection.aggregate([{ $match: FILTER },
    { $group: { _id: { tenantId: '$tenantId', orderId: '$orderId' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }, { $limit: 1 }]).toArray();
  if (duplicate.length) throw new Error('存在重复订单咨询记录，停止迁移');
  const report = { mode: apply ? 'apply' : 'dry-run', legacy: legacy.map(index => index.name),
    replacement: !!replacement, unlinkedCases: await collection.countDocuments({ orderId: null }) };
  if (!apply) return report;
  if (!replacement) await collection.createIndex(KEY, { name: NEW_NAME, unique: true, partialFilterExpression: FILTER });
  for (const index of legacy) await collection.dropIndex(index.name);
  const final = await collection.indexes();
  if (!final.some(index => index.name === NEW_NAME) || final.some(index => legacy.some(old => old.name === index.name)))
    throw new Error('索引迁移后校验失败');
  return { ...report, migrated: true };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  try { console.log(JSON.stringify(await migrate(mongoose.connection.db.collection('expertconsultationcases'), process.argv.includes('--apply')))); }
  finally { await mongoose.disconnect(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { migrate };
