// Reclassify Jiayihui's existing mall products. Dry run by default.
// Run from backend/ with MONGODB_URI available:
//   node scripts/reclassify-mall-products.js
//   node scripts/reclassify-mall-products.js --apply
require('dotenv').config({path:require('path').join(__dirname,'../.env')});
const fs=require('fs');
const path=require('path');
const mongoose = require('mongoose');
const Tenant = require('../src/models/Tenant');
const Product = require('../src/models/Product');
const ProductCategory = require('../src/models/ProductCategory');
const { tree, plannedCategoryByName } = require('../src/data/mallCategoryPlan');

const legacyNames = new Set([
  '营养干预服务', '就医协助服务', '健康体检服务',
  '年度健康计划', '定制化健康服务', '运动评估与复健',
]);

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  const tenant = await Tenant.findOne({ code: 'jiayihui' }).lean();
  if (!tenant) throw new Error('未找到嘉医汇机构');
  const tenantId = tenant._id;
  const products = await Product.find({ tenantId }).select('_id name category status').lean();
  const live = products.filter(product => product.status === 'on');
  const countByName = new Map();
  for (const product of products) countByName.set(product.name, (countByName.get(product.name) || 0) + 1);
  const duplicated = [...countByName].filter(([, count]) => count > 1).map(([name]) => name);
  const missing = [...plannedCategoryByName.keys()].filter(name => !live.some(product => product.name === name));
  const uncovered = live.filter(product => !plannedCategoryByName.has(product.name)).map(product => product.name);
  const unexpected = products.filter(product => plannedCategoryByName.has(product.name)
    && product.category !== plannedCategoryByName.get(product.name)
    && !legacyNames.has(product.category)
    && product.category !== '专病管理').map(product => ({ name: product.name, category: product.category }));
  if (duplicated.length || missing.length || uncovered.length || unexpected.length) {
    throw new Error(`商品清单已变化，停止迁移：${JSON.stringify({ duplicated, missing, uncovered, unexpected })}`);
  }

  const changes = products.filter(product => plannedCategoryByName.has(product.name)
    && product.category !== plannedCategoryByName.get(product.name))
    .map(product => ({ id: String(product._id), name: product.name, from: product.category,
      to: plannedCategoryByName.get(product.name), status: product.status }));
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run',
    tenant: tenant.name, liveCount: live.length, plannedCount: plannedCategoryByName.size,
    changes }, null, 2));
  if (!process.argv.includes('--apply')) return;

  const backupDir=path.join(__dirname,'../../backups');
  fs.mkdirSync(backupDir,{recursive:true});
  const backupPath=path.join(backupDir,`mall-categories-${Date.now()}.json`);
  fs.writeFileSync(backupPath,JSON.stringify({tenantId,products,categories:await ProductCategory.find({tenantId}).lean()},null,2));
  console.log('Backup: '+backupPath);
  for (const [rootIndex, root] of tree.entries()) {
    const parent = await ProductCategory.findOneAndUpdate(
      { tenantId, name: root.name },
      { $set: { parent: null, sortOrder: rootIndex * 10 }, $setOnInsert: { tenantId, name: root.name } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    for (const [childIndex, name] of root.children.entries()) {
      await ProductCategory.findOneAndUpdate(
        { tenantId, name },
        { $set: { parent: parent._id, sortOrder: childIndex * 10 }, $setOnInsert: { tenantId, name } },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
  }
  for (const change of changes) {
    const result = await Product.updateOne(
      { _id: change.id, tenantId, category: change.from },
      { $set: { category: change.to } },
    );
    if (result.modifiedCount !== 1) throw new Error(`商品迁移发生并发变更：${change.name}`);
  }
  const removedLegacyCategories = [];
  for (const name of legacyNames) {
    if (await Product.exists({ tenantId, category: name })) continue;
    const category = await ProductCategory.findOne({ tenantId, name });
    if (!category || await ProductCategory.exists({ tenantId, parent: category._id })) continue;
    await ProductCategory.deleteOne({ _id: category._id, tenantId });
    removedLegacyCategories.push(name);
  }
  const verified = await Product.find({ tenantId, status: 'on' }).select('name category').lean();
  const mismatched = verified.filter(product => product.category !== plannedCategoryByName.get(product.name));
  if (mismatched.length) throw new Error(`迁移后校验失败：${JSON.stringify(mismatched)}`);
  console.log(JSON.stringify({ applied: changes.length, verified: verified.length, removedLegacyCategories }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect().catch(() => {}));
