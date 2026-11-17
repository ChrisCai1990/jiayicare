// Reconcile the Jiayihui mall into four top-level categories.
// Dry-run by default. --apply requires the exact reviewed live catalog shape.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const apply = process.argv.includes('--apply');
const keepRoots = ['就医与咨询', '检测与评估', '健康管理', '生涯规划与成长'];
const retiredRoots = ['营养与食养', '健康用品', '健康体检服务', '定制化健康服务'];
const reparent = {
  营养素补充: '健康管理',
  药食同源: '健康管理',
  健康设备: '健康管理',
  运动复健用品: '健康管理',
};
const productMoves = {
  '365会员专享就医协助自选服务包': ['就医与咨询', '就医服务'],
  '健康风险评估': ['健康体检服务', '体检与报告'],
  '艾维口腔365会员年卡': ['健康体检服务', '年度健康管理'],
  '轻享健康计划': ['健康体检服务', '年度健康管理'],
  '成长护航计划｜儿童生长发育管理': ['定制化健康服务', '年度健康管理'],
};

async function main() {
  if (!process.env.MONGODB_URI) throw Error('MONGODB_URI missing');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  try {
    const db = mongoose.connection.db;
    const tenant = await db.collection('tenants').findOne({ code: 'jiayihui' }, { projection: { _id: 1 } });
    if (!tenant) throw Error('Jiayihui tenant missing');
    const tenantId = tenant._id;
    const [categories, products] = await Promise.all([
      db.collection('productcategories').find({ tenantId }).toArray(),
      db.collection('products').find({ tenantId }, { projection: { name: 1, category: 1, status: 1, originalPrice: 1 } }).toArray(),
    ]);
    if (categories.length !== 29 || products.length !== 95) throw Error(`Catalog changed: ${categories.length} categories, ${products.length} products`);
    const byName = new Map(categories.map(c => [c.name, c]));
    if (byName.size !== categories.length) throw Error('Duplicate category names');
    const currentRoots = categories.filter(c => !c.parent).map(c => c.name).sort();
    const expectedRoots = [...keepRoots, ...retiredRoots].sort();
    if (JSON.stringify(currentRoots) !== JSON.stringify(expectedRoots)) throw Error('Root category set changed');
    const productByName = new Map(products.map(p => [p.name, p]));
    if (productByName.size !== products.length) throw Error('Duplicate product names; stop for review');
    for (const [name, [from, to]] of Object.entries(productMoves)) {
      if (productByName.get(name)?.category !== from || !byName.has(to) || byName.get(to).parent == null)
        throw Error('Product move preflight failed: ' + name);
    }
    for (const [name, target] of Object.entries(reparent)) {
      if (String(byName.get(name)?.parent) !== String(byName.get(name === '健康设备' || name === '运动复健用品' ? '健康用品' : '营养与食养')._id)
        || byName.get(target)?.parent != null) throw Error('Category parent preflight failed: ' + name);
    }
    for (const root of retiredRoots) {
      const leftovers = products.filter(p => p.category === root && !Object.hasOwn(productMoves, p.name));
      if (leftovers.length) throw Error('Unmapped products in retired category: ' + root);
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', tenantId: String(tenantId),
      existingRoots: currentRoots, targetRoots: ['就医与咨询', '检测与评估', '健康管理与用品', '生涯规划与成长'],
      productsToMove: Object.entries(productMoves).map(([name, [, to]]) => ({ name, to })),
      childrenToReparent: reparent, expectedProducts: products.length }));
    if (!apply) return;
    const backup = path.resolve(process.cwd(), '../backups', `mall-categories-before-merge-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, JSON.stringify({ tenantId, categories, products }, null, 2), 'utf8');
    console.log(JSON.stringify({ backup }));
    for (const [name, [from, to]] of Object.entries(productMoves)) {
      const product = productByName.get(name);
      const result = await db.collection('products').updateOne({ _id: product._id, tenantId, category: from }, { $set: { category: to } });
      if (result.matchedCount !== 1) throw Error('Concurrent product change: ' + name);
    }
    for (const [name, parentName] of Object.entries(reparent)) {
      const category = byName.get(name);
      const result = await db.collection('productcategories').updateOne({ _id: category._id, tenantId, parent: category.parent },
        { $set: { parent: byName.get(parentName)._id } });
      if (result.matchedCount !== 1) throw Error('Concurrent category change: ' + name);
    }
    const healthRoot = byName.get('健康管理');
    const renamed = await db.collection('productcategories').updateOne({ _id: healthRoot._id, tenantId, name: '健康管理', parent: null },
      { $set: { name: '健康管理与用品' } });
    if (renamed.matchedCount !== 1) throw Error('Concurrent health root change');
    for (const name of retiredRoots) {
      const category = byName.get(name);
      if (await db.collection('productcategories').countDocuments({ tenantId, parent: category._id }))
        throw Error('Retired root still has children: ' + name);
      if (await db.collection('products').countDocuments({ tenantId, category: name }))
        throw Error('Retired root still has products: ' + name);
      const result = await db.collection('productcategories').deleteOne({ _id: category._id, tenantId, name, parent: null });
      if (result.deletedCount !== 1) throw Error('Concurrent retired root change: ' + name);
    }
    const final = await db.collection('productcategories').find({ tenantId }).toArray();
    const roots = final.filter(c => !c.parent).map(c => c.name).sort();
    if (final.length !== 25 || JSON.stringify(roots) !== JSON.stringify(['就医与咨询', '检测与评估', '健康管理与用品', '生涯规划与成长'].sort()))
      throw Error('Final category tree mismatch');
    console.log(JSON.stringify({ verifiedRoots: roots, verifiedCategories: final.length, verifiedProducts: await db.collection('products').countDocuments({ tenantId }) }));
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 });
