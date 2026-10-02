// Dry run: node src/scripts/assignJiayihuiCareRecordsTenant.js
// Apply during a write pause, after a verified backup:
// node src/scripts/assignJiayihuiCareRecordsTenant.js --apply --backup-confirmed --expect-followups=N --expect-pushrecords=N
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const expected = name => {
  const arg = args.find(item => item.startsWith(`--expect-${name}=`));
  return arg ? Number(arg.split('=')[1]) : null;
};

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI 未配置');
  if (apply && (!args.includes('--backup-confirmed') ||
    !Number.isSafeInteger(expected('followups')) || !Number.isSafeInteger(expected('pushrecords')))) {
    throw new Error('需确认备份并填写随访、推送预检数量');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const db = mongoose.connection.db;
    const tenant = await db.collection('tenants').findOne({ code: 'jiayihui', status: 'active' });
    if (!tenant) throw new Error('未找到启用的嘉医汇机构');
    const otherTenants = await db.collection('tenants').countDocuments({ _id: { $ne: tenant._id } });
    const counts = {};
    for (const name of ['followups', 'pushrecords']) {
      const coll = db.collection(name);
      const [total, unassigned, foreign, badPatient] = await Promise.all([
        coll.countDocuments({}),
        coll.countDocuments({ tenantId: null }),
        coll.countDocuments({ tenantId: { $exists: true, $nin: [null, tenant._id] } }),
        coll.aggregate([
          { $lookup: { from: 'users', localField: 'patientId', foreignField: '_id', as: 'patient' } },
          { $match: { $or: [{ patient: { $size: 0 } }, { 'patient.tenantId': { $ne: tenant._id } }] } },
          { $count: 'count' },
        ]).toArray().then(rows => rows[0]?.count || 0),
      ]);
      counts[name] = { total, unassigned, foreign, badPatient };
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', otherTenants, counts }, null, 2));
    if (!apply) return;
    if (otherTenants) throw new Error('已存在其他机构，禁止全量归属嘉医汇');
    for (const [name, row] of Object.entries(counts)) {
      if (row.total !== expected(name) || row.foreign || row.badPatient) throw new Error(`${name} 数量或客户归属与预检不一致`);
    }
    for (const name of Object.keys(counts)) {
      const result = await db.collection(name).updateMany({ tenantId: null }, { $set: { tenantId: tenant._id } });
      console.log(`${name}: ${result.modifiedCount}`);
    }
    for (const name of Object.keys(counts)) {
      const remaining = await db.collection(name).countDocuments({ tenantId: null });
      if (remaining) throw new Error(`${name} 仍有 ${remaining} 条未归属`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
