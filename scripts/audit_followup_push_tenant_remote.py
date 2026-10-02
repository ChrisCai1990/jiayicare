"""Read-only production counts for FollowUp/PushRecord ownership migration."""
import json
from ssh_config import connect

COMMAND = r'''cd /var/www/jiayicare && node <<'NODE'
const fs = require('fs');
const mongoose = require('mongoose');
const env = require('dotenv').parse(fs.readFileSync('backend/.env'));
(async () => {
  await mongoose.connect(env.MONGODB_URI, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const tenant = await db.collection('tenants').findOne({ code: 'jiayihui' }, { projection: { _id: 1 } });
  if (!tenant) throw new Error('Jiayihui tenant missing');
  const output = {};
  for (const name of ['followups', 'pushrecords']) {
    const collection = db.collection(name);
    const [total, unassigned, foreign, ownership] = await Promise.all([
      collection.countDocuments({}),
      collection.countDocuments({ tenantId: null }),
      collection.countDocuments({ tenantId: { $exists: true, $nin: [null, tenant._id] } }),
      collection.aggregate([
        { $lookup: { from: 'users', localField: 'patientId', foreignField: '_id', as: 'patient' } },
        { $project: { patientTenant: { $arrayElemAt: ['$patient.tenantId', 0] }, found: { $gt: [{ $size: '$patient' }, 0] } } },
        { $group: { _id: { found: '$found', patientTenant: '$patientTenant' }, count: { $sum: 1 } } },
      ]).toArray(),
    ]);
    output[name] = { total, unassigned, foreign,
      matchedJiayihui: ownership.filter(row => row._id.found && String(row._id.patientTenant) === String(tenant._id)).reduce((n, row) => n + row.count, 0),
      missingPatient: ownership.filter(row => !row._id.found).reduce((n, row) => n + row.count, 0),
      otherPatientTenant: ownership.filter(row => row._id.found && String(row._id.patientTenant) !== String(tenant._id)).reduce((n, row) => n + row.count, 0),
    };
  }
  console.log(JSON.stringify(output));
  await mongoose.disconnect();
})().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
NODE'''

if __name__ == '__main__':
    client = connect()
    try:
        _, stdout, stderr = client.exec_command(COMMAND, timeout=60)
        output = stdout.read().decode('utf-8')
        error = stderr.read().decode('utf-8')
        if stdout.channel.recv_exit_status():
            raise RuntimeError('Read-only ownership audit failed: ' + error[:500])
        print(json.dumps(json.loads(output), ensure_ascii=False, indent=2))
    finally:
        client.close()
