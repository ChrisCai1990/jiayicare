/** Preview: node scripts/createCooperationWorkbenchIndexes.js
 *  Apply: node scripts/createCooperationWorkbenchIndexes.js --apply
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const definitions = [
  { collection: 'cooperationagreements', name: 'cooperation_subject_archived',
    key: { tenantId: 1, subjectType: 1, subjectId: 1, archivedAt: -1 } },
  { collection: 'cooperationagreements', name: 'cooperation_subject_file_unique',
    key: { tenantId: 1, subjectType: 1, subjectId: 1, sha256: 1 }, unique: true },
  { collection: 'cooperationprofessionalteams', name: 'cooperation_team_leader',
    key: { tenantId: 1, leaderStaffId: 1, status: 1 } },
  { collection: 'cooperationprofessionalteams', name: 'cooperation_team_representative',
    key: { tenantId: 1, authorizedRepresentativeStaffId: 1, status: 1 } },
  { collection: 'cooperationprofessionalteams', name: 'cooperation_team_member',
    key: { tenantId: 1, memberStaffIds: 1, status: 1 } },
];

async function createIndexes(db, apply = false) {
  const report = [];
  for (const item of definitions) {
    const collection = db.collection(item.collection);
    const existing = await collection.indexes().catch(error => error.codeName === 'NamespaceNotFound' ? [] : Promise.reject(error));
    const found = existing.find(index => index.name === item.name);
    if (found && (JSON.stringify(found.key) !== JSON.stringify(item.key) || Boolean(found.unique) !== Boolean(item.unique)))
      throw new Error(`${item.collection}.${item.name} 与预期不符`);
    if (item.unique) {
      const duplicate = await collection.aggregate([{ $group: { _id: { tenantId: '$tenantId',
        subjectType: '$subjectType', subjectId: '$subjectId', sha256: '$sha256' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }, { $limit: 1 }]).toArray();
      if (duplicate.length) throw new Error('已存在同一主体的重复文件摘要，停止建立唯一索引');
    }
    if (apply && !found) await collection.createIndex(item.key, { name: item.name, unique: !!item.unique });
    report.push({ collection: item.collection, index: item.name, existed: !!found, applied: apply && !found });
  }
  return report;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  try { console.log(JSON.stringify(await createIndexes(mongoose.connection.db, process.argv.includes('--apply')))); }
  finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { createIndexes };
