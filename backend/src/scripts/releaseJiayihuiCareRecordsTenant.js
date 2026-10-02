// Run only while jiayicare-backend and jiayicare-wecom-archive are stopped.
// This command backs up Mongo, checks both collections, and assigns all legacy
// FollowUp/PushRecord rows to Jiayihui before the new backend process starts.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${binary} 失败: ${String(result.stderr || '').slice(-400)}`);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI 未配置');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const db = mongoose.connection.db;
    const tenant = await db.collection('tenants').findOne({ code: 'jiayihui', status: 'active' });
    if (!tenant) throw new Error('嘉医汇机构不存在或已停用');
    if (await db.collection('tenants').countDocuments({ _id: { $ne: tenant._id } })) throw new Error('已存在其他机构，拒绝全量迁移');
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
      if (foreign || badPatient || total < 1) throw new Error(`${name} 数量或客户归属异常`);
      counts[name] = { total, unassigned };
    }

    const dir = '/var/backups/jiayicare';
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archive = `${dir}/pre-care-tenant-${stamp}.archive.gz`;
    const config = `/tmp/jiayicare-mongodump-${process.pid}.yaml`;
    try {
      fs.writeFileSync(config, `uri: ${JSON.stringify(process.env.MONGODB_URI)}\n`, { mode: 0o600 });
      command('mongodump', [`--config=${config}`, `--archive=${archive}`, '--gzip', '--quiet']);
      if (fs.statSync(archive).size < 1000000) throw new Error('备份文件异常小');
      command('gzip', ['-t', archive]);
    } finally { try { fs.unlinkSync(config); } catch {} }
    const hash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    console.log(JSON.stringify({ backup: archive, bytes: fs.statSync(archive).size, sha256: hash, counts }));

    for (const name of Object.keys(counts)) {
      const result = await db.collection(name).updateMany({ tenantId: null }, { $set: { tenantId: tenant._id } });
      console.log(`${name}: ${result.modifiedCount}`);
      const remaining = await db.collection(name).countDocuments({ tenantId: null });
      if (remaining) throw new Error(`${name} 仍有 ${remaining} 条未归属`);
    }
    console.log('随访与推送历史归属迁移完成');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
