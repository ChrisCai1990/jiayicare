// Read-only diagnostic: never repairs/deletes tasks or loads production config.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

async function main() {
  const manifest = process.argv[2];
  const session = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  const service = JSON.parse(fs.readFileSync(path.join(path.dirname(manifest), 'service-http.json'), 'utf8'));
  await mongoose.connect(`mongodb://127.0.0.1:27134/${session.database}`, { serverSelectionTimeoutMS: 3000, autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const oid = value => new mongoose.Types.ObjectId(value);
  assert.equal((await db.collection('users').findOne({ _id: oid(session.patientId) })).name, '隔离验收客户（纯虚构）');
  const plan = await db.collection('healthplans').findOne({ _id: oid(service.serviceId), patientId: oid(session.patientId) });
  assert.ok(plan, 'exact synthetic service required');
  const tasks = await db.collection('followups').find({ sourceHealthPlanId: plan._id, patientId: oid(session.patientId), sourceType: 'health_plan' }).toArray();
  const schemes = await db.collection('followupplans').find({ _id: { $in: tasks.map(t => t.followUpSchemeId).filter(Boolean) } }).toArray();
  const open = tasks.filter(t => !['completed', 'cancelled'].includes(t.status));
  console.log(JSON.stringify({ serviceStatus: plan.status, taskCount: tasks.length,
    unfinished: open.map(t => ({ id: String(t._id), workflowKey: t.workflowKey, stage: schemes.find(s => String(s._id) === String(t.followUpSchemeId))?.workflowStageKey || '', status: t.status, blocked: t.isBlocked })),
    consistent: plan.status !== 'completed' || open.length === 0,
    scope: 'Read-only synthetic service task audit, not AI/clinical/payment acceptance' }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
