/*
 * Build an isolated, anonymized production-data copy for staging validation.
 *
 * Safety properties:
 * - dry-run unless --apply and STAGING_COPY_CONFIRM are both supplied;
 * - reads only from the production database named "jiayicare";
 * - can write only to a brand-new database named jiayicare_staging_import_*;
 * - never copies report originals, credentials, messages, payment records or tokens;
 * - never drops, renames or overwrites a database.
 */
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const {
  collectionCopyPolicy,
  sanitizeDocument,
  stableAlias,
} = require('../src/utils/stagingDataSanitizer');

const APPLY = process.argv.includes('--apply');
const targetArg = process.argv.find(arg => arg.startsWith('--target-db='));
const TARGET_DB = targetArg ? targetArg.slice('--target-db='.length) : '';
const CONFIRM_VALUE = 'create-isolated-anonymized-staging-copy-v1';
const BATCH_SIZE = 300;

function assertSafety({ sourceDbName, targetDbName, apply, confirm, salt }) {
  if (sourceDbName !== 'jiayicare') throw new Error(`拒绝读取非生产基准库：${sourceDbName || '未指定'}`);
  if (!apply) return;
  if (!/^jiayicare_staging_import_[a-z0-9_]+$/.test(targetDbName)) {
    throw new Error('写入目标必须是全新的 jiayicare_staging_import_* 临时库');
  }
  if (confirm !== CONFIRM_VALUE) throw new Error('缺少 staging 脱敏复制确认值');
  if (String(salt || '').length < 32) throw new Error('STAGING_ANONYMIZATION_SALT 至少需要 32 个字符');
}

async function buildNameReplacements(sourceDb, salt) {
  const [rows, staffRows] = await Promise.all([
    sourceDb.collection('users').find({}, { projection: { _id: 1, name: 1, nickname: 1 } }).toArray(),
    sourceDb.collection('admins').find({}, { projection: { _id: 1, name: 1 } }).toArray(),
  ]);
  const replacements = [];
  for (const row of rows) {
    const alias = stableAlias('测试会员', row._id, salt);
    for (const source of [row.name, row.nickname]) {
      const normalized = String(source || '').trim();
      if (normalized.length >= 2) replacements.push({ source: normalized, alias });
    }
  }
  for (const row of staffRows) {
    const source = String(row.name || '').trim();
    if (source.length >= 2) replacements.push({ source, alias: stableAlias('测试医护', row._id, salt) });
  }
  const unique = new Map();
  for (const entry of replacements) if (!unique.has(entry.source)) unique.set(entry.source, entry);
  return [...unique.values()];
}

async function copyIndexes(sourceCollection, targetCollection) {
  const indexes = (await sourceCollection.indexes()).filter(index => index.name !== '_id_');
  for (const index of indexes) {
    const { key, name, unique, sparse, expireAfterSeconds, partialFilterExpression, collation } = index;
    await targetCollection.createIndex(key, {
      name,
      ...(unique != null ? { unique } : {}),
      ...(sparse != null ? { sparse } : {}),
      ...(expireAfterSeconds != null ? { expireAfterSeconds } : {}),
      ...(partialFilterExpression ? { partialFilterExpression } : {}),
      ...(collation ? { collation } : {}),
    });
  }
}

async function copyCollection({ sourceDb, targetDb, collectionName, nameReplacements, salt }) {
  const source = sourceDb.collection(collectionName);
  const target = targetDb.collection(collectionName);
  const cursor = source.find({}).batchSize(BATCH_SIZE);
  let batch = [];
  let copied = 0;
  for await (const document of cursor) {
    batch.push(sanitizeDocument(collectionName, document, { salt, nameReplacements }));
    if (batch.length >= BATCH_SIZE) {
      await target.insertMany(batch, { ordered: false });
      copied += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await target.insertMany(batch, { ordered: false });
    copied += batch.length;
  }
  await copyIndexes(source, target);
  return copied;
}

async function main() {
  const sourceUri = String(process.env.MONGODB_URI || '');
  if (!sourceUri) throw new Error('缺少 MONGODB_URI');
  const client = new MongoClient(sourceUri, { ignoreUndefined: true });
  await client.connect();
  try {
    const sourceDb = client.db();
    const salt = String(process.env.STAGING_ANONYMIZATION_SALT || '');
    assertSafety({
      sourceDbName: sourceDb.databaseName,
      targetDbName: TARGET_DB,
      apply: APPLY,
      confirm: process.env.STAGING_COPY_CONFIRM,
      salt,
    });

    const collectionInfos = (await sourceDb.listCollections({}, { nameOnly: true }).toArray())
      .filter(info => !info.name.startsWith('system.'))
      .sort((a, b) => a.name.localeCompare(b.name));
    const plan = [];
    for (const { name } of collectionInfos) {
      plan.push({
        collection: name,
        policy: collectionCopyPolicy(name),
        sourceCount: await sourceDb.collection(name).estimatedDocumentCount(),
      });
    }

    if (!APPLY) {
      console.log(JSON.stringify({
        mode: 'dry-run',
        sourceDatabase: sourceDb.databaseName,
        targetDatabase: TARGET_DB || null,
        sourceCollections: plan.length,
        copiedCollections: plan.filter(row => row.policy === 'sanitize').length,
        excludedCollections: plan.filter(row => row.policy === 'exclude'),
        plannedDocuments: plan.filter(row => row.policy === 'sanitize').reduce((sum, row) => sum + row.sourceCount, 0),
      }, null, 2));
      return;
    }

    const existing = await client.db('admin').admin().listDatabases();
    if (existing.databases.some(database => database.name === TARGET_DB)) {
      throw new Error(`目标临时库 ${TARGET_DB} 已存在，拒绝覆盖`);
    }
    const targetDb = client.db(TARGET_DB);
    const nameReplacements = await buildNameReplacements(sourceDb, salt);
    const results = [];
    for (const row of plan) {
      if (row.policy === 'exclude') {
        results.push({ ...row, copiedCount: 0 });
        continue;
      }
      const copiedCount = await copyCollection({
        sourceDb,
        targetDb,
        collectionName: row.collection,
        nameReplacements,
        salt,
      });
      results.push({ ...row, copiedCount });
      console.log(`[staging-copy] ${row.collection}: ${copiedCount}/${row.sourceCount}`);
    }
    const manifest = {
      version: 1,
      createdAt: new Date(),
      sourceDatabase: sourceDb.databaseName,
      targetDatabase: TARGET_DB,
      saltFingerprint: crypto.createHash('sha256').update(salt).digest('hex').slice(0, 16),
      exclusions: results.filter(row => row.policy === 'exclude').map(row => row.collection),
      collections: results,
      originalFilesCopied: false,
    };
    await targetDb.collection('_staging_copy_manifest').insertOne(manifest);
    console.log(JSON.stringify({ success: true, ...manifest }, null, 2));
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { assertSafety };
