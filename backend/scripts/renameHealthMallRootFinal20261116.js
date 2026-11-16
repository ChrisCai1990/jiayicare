// Final customer-selected label. Dry-run by default; preserves the category ID.
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('node:path');
const from = '健康管理与康养';
const to = '健康管理与健康产品';
const apply = process.argv.includes('--apply');
(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  try {
    const db = mongoose.connection.db;
    const tenant = await db.collection('tenants').findOne({ code: 'jiayihui' }, { projection: { _id: 1 } });
    if (!tenant) throw Error('Jiayihui tenant missing');
    const tenantId = tenant._id;
    const categories = await db.collection('productcategories').find({ tenantId }).toArray();
    const current = categories.find(c => c.name === from && !c.parent);
    if (!current || categories.some(c => c.name === to) || categories.length !== 25) throw Error('Unexpected category tree');
    const children = categories.filter(c => String(c.parent) === String(current._id));
    if (children.length !== 8) throw Error('Health child count changed');
    const direct = await db.collection('products').countDocuments({ tenantId, category: from });
    if (direct) throw Error('Root has direct products');
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', from, to, children: children.map(c => c.name), directProducts: direct }));
    if (!apply) return;
    const backup = path.resolve(process.cwd(), '../backups', `mall-health-root-final-before-rename-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, JSON.stringify(categories, null, 2), 'utf8');
    const result = await db.collection('productcategories').updateOne({ _id: current._id, tenantId, name: from, parent: null },
      { $set: { name: to } });
    if (result.matchedCount !== 1) throw Error('Concurrent root change');
    const roots = await db.collection('productcategories').find({ tenantId, parent: null }, { projection: { name: 1 } }).toArray();
    const names = roots.map(c => c.name).sort();
    if (JSON.stringify(names) !== JSON.stringify(['就医与咨询', '检测与评估', to, '生涯规划与成长'].sort()))
      throw Error('Final roots mismatch');
    console.log(JSON.stringify({ backup, verifiedRoots: names }));
  } finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 });
