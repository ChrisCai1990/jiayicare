// Dry run: node src/scripts/assignJiayihuiTenant.js
// Apply only after backup, maintenance window and count review:
// node src/scripts/assignJiayihuiTenant.js --apply --backup-confirmed --expect-users=N --expect-admins=N
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const Tenant = require('../models/Tenant');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const expected = key => {
  const raw = args.find(arg => arg.startsWith(`--expect-${key}=`));
  return raw ? Number(raw.split('=')[1]) : null;
};

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI 未配置');
  if (apply && (!args.includes('--backup-confirmed') || !Number.isSafeInteger(expected('users')) || !Number.isSafeInteger(expected('admins')))) {
    throw new Error('执行前需确认备份，并填写审计所得 --expect-users 和 --expect-admins');
  }
  const modelDir = path.join(__dirname, '../models');
  for (const file of fs.readdirSync(modelDir).filter(name => name.endsWith('.js'))) require(path.join(modelDir, file));
  const collections = [...new Map(mongoose.modelNames().map(name => mongoose.model(name))
    .filter(model => model.schema.path('tenantId'))
    .map(model => [model.collection.name, model.collection.name])).values()].sort();

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const db = mongoose.connection.db;
    const tenant = await db.collection('tenants').findOne({ code: 'jiayihui' });
    const tenantId = tenant?._id || new mongoose.Types.ObjectId();
    const rows = [];
    for (const collectionName of collections) {
      const filter = collectionName === 'admins'
        ? { tenantId: null, role: { $ne: 'platformSuper' } }
        : { tenantId: null };
      const collection = db.collection(collectionName);
      rows.push({ collection: collectionName, unassigned: await collection.countDocuments(filter), filter });
    }
    const users = rows.find(row => row.collection === 'users')?.unassigned ?? 0;
    const admins = rows.find(row => row.collection === 'admins')?.unassigned ?? 0;
    const foreignFilter = { tenantId: { $exists: true, $nin: [null, tenantId] } };
    const foreignUsers = await db.collection('users').countDocuments(foreignFilter);
    const foreignAdmins = await db.collection('admins').countDocuments({ role: { $ne: 'platformSuper' }, ...foreignFilter });
    const otherTenants = await db.collection('tenants').countDocuments({ code: { $ne: 'jiayihui' } });
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', tenantId: String(tenantId), users, admins, foreignUsers, foreignAdmins, otherTenants, collections: rows.map(({ collection, unassigned }) => ({ collection, unassigned })) }, null, 2));
    if (!apply) return;
    if (users !== expected('users') || admins !== expected('admins')) throw new Error('客户或员工数量与预检不一致，未执行迁移');
    if (foreignUsers || foreignAdmins || otherTenants) throw new Error('已存在其他机构或其客户员工，无法把全部未归属记录批量判定为嘉医汇');
    if (!tenant) await db.collection('tenants').insertOne({ _id: tenantId, code: 'jiayihui', name: '嘉医汇', status: 'active', themeColor: '#1E6B50', createdAt: new Date(), updatedAt: new Date() });
    for (const row of rows) {
      if (!row.unassigned) continue;
      const result = await db.collection(row.collection).updateMany(row.filter, { $set: { tenantId } });
      console.log(`${row.collection}: ${result.modifiedCount}`);
    }
    const remaining = await db.collection('users').countDocuments({ tenantId: null });
    if (remaining) throw new Error(`仍有 ${remaining} 位客户未归属，请核对并重跑`);
    console.log('嘉医汇历史归属迁移完成；请继续核对关联记录和平台/机构页面。');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
