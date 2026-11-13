// Audit new partner-team and employee-threshold indexes before the backend restart.
// Apply only while these new collections are empty; existing financial rows need
// a separately reviewed migration if an index is ever missing later.
const { execFileSync } = require('node:child_process');
const mongoose = require('mongoose');
const { sameIndex } = require('../utils/marketPartnerIndexes');

const models = ['PartnerTeamRelation', 'PartnerTeamRule', 'PartnerTeamEarning',
  'StaffServiceThresholdRule'].map(name => require(`../models/${name}`));

async function main() {
  const apply = process.argv.includes('--apply');
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    const processList = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
    const backend = processList.find(item => item.name === 'jiayicare-backend');
    uri = backend?.pm2_env?.MONGODB_URI || backend?.pm2_env?.env?.MONGODB_URI;
  }
  if (!uri) throw new Error('缺少生产数据库连接配置');
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    for (const model of models) {
      let indexes;
      try { indexes = await model.collection.indexes(); }
      catch (error) {
        if (error.code !== 26 && error.codeName !== 'NamespaceNotFound') throw error;
        indexes = [];
      }
      const missing = model.schema.indexes().filter(([key, options]) =>
        !indexes.some(actual => sameIndex(actual, { key, options })));
      const count = indexes.length ? await model.collection.countDocuments({}) : 0;
      console.log(`${model.collection.name}: documents=${count}, missingIndexes=${missing.length}`);
      if (apply && missing.length && count > 0)
        throw new Error(`${model.collection.name} 已有数据，禁止自动补建缺失索引`);
      if (apply) for (const [key, options] of missing)
        await model.collection.createIndex(key, options);
    }
  } finally { await mongoose.disconnect(); }
}

main().catch(error => { console.error(`团队核算索引预检失败: ${error.message}`); process.exitCode = 1; });
