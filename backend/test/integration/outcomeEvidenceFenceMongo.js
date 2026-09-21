// Isolated real Mongo verification of the fence, not full clinical/AI acceptance.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const { outcomeEvidenceFence, fencedClose } = require('../../src/utils/outcomeEvidenceFence');
async function main() {
  if (process.env.RUN_ISOLATED_ACCEPTANCE !== 'true') throw Error('Explicit isolation flag required');
  const db = process.argv[2] || `jiayicare_acceptance_${randomBytes(16).toString('hex')}`;
  assert.match(db, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  await mongoose.connect(`mongodb://127.0.0.1:27134/${db}`, { autoIndex: false });
  const models = {};
  for (const name of ['FollowUp', 'Report', 'Draft']) {
    const schema = new mongoose.Schema({ status: String, outcomeReview: Object, outcomeClosureIntent: Object,
      patientId: String, value: String }, { timestamps: true });
    schema.plugin(outcomeEvidenceFence);
    models[name] = mongoose.model(`FenceTest${name}`, schema);
  }
  if (process.argv[3] === 'crash') {
    const task = await models.FollowUp.findById(process.argv[4]).lean();
    const row = await models.Report.findById(process.argv[5]).lean();
    const update = models.FollowUp.findOneAndUpdate;
    models.FollowUp.findOneAndUpdate = function (...args) {
      if (args[1].$set?.outcomeReview) process.exit(44);
      return update.apply(this, args);
    };
    await fencedClose({ models, task, actor: { _id: 'synthetic-advisor' }, body: { decision: 'no_further' },
      evidence: [{ model: 'Report', row }], proof: { decision: 'no_further' }, now: new Date() });
    throw Error('Expected hard exit before closure');
  }
  const make = async () => {
    const task = await models.FollowUp.create({ patientId: 'synthetic', status: 'in_progress' });
    const source = await models.Report.create({ value: 'audited' });
    return { models, task: task.toObject(), actor: { _id: 'synthetic-advisor' }, body: { decision: 'no_further' },
      evidence: [{ model: 'Report', row: source.toObject() }], proof: { decision: 'no_further' }, now: new Date() };
  };
  const a = await make();
  const originalUpdate = models.Report.updateOne;
  let during = false;
  models.Report.updateOne = function (...args) {
    const q = originalUpdate.apply(this, args), exec = q.exec;
    q.exec = async function (...execArgs) {
      const r = await exec.apply(this, execArgs);
      if (args[1].$set?.outcomeEvidenceLock?.token && r.modifiedCount === 1) {
        during = true;
        assert.equal((await originalUpdate.call(models.Report, { _id: a.evidence[0].row._id }, { $set: { value: 'withdrawn' } })).modifiedCount, 0);
        assert.equal((await models.Report.deleteOne({ _id: a.evidence[0].row._id })).deletedCount, 0);
        const doc = await models.Report.findById(a.evidence[0].row._id);
        assert.equal((await doc.deleteOne()).deletedCount, 0);
        doc.value = 'changed';
        await assert.rejects(doc.save());
        assert.equal((await models.FollowUp.updateOne({ _id: a.task._id }, { $set: { status: 'cancelled' } })).modifiedCount, 0);
      }
      return r;
    };
    return q;
  };
  assert.equal((await fencedClose(a)).status, 'completed'); assert.equal(during, true);
  models.Report.updateOne = originalUpdate;
  assert.equal((await models.Report.findById(a.evidence[0].row._id)).outcomeEvidenceLock, null);
  assert.equal((await models.Report.updateOne({ _id: a.evidence[0].row._id }, { $set: { value: 'new revision' } })).modifiedCount, 1);
  const b = await make();
  await models.Report.updateOne({ _id: b.evidence[0].row._id }, { $set: { value: 'withdrawn', updatedAt: new Date(Date.now() + 1000) } }, { timestamps: false });
  await assert.rejects(fencedClose(b), { statusCode: 409 });
  assert.equal((await models.FollowUp.findById(b.task._id)).status, 'in_progress');
  assert.equal((await models.FollowUp.findById(b.task._id)).outcomeClosureIntent, null);
  const sameTime = await make();
  await models.Report.updateOne({ _id: sameTime.evidence[0].row._id }, { $set: { value: 'same-ms change' } }, { timestamps: false });
  await assert.rejects(fencedClose(sameTime), { statusCode: 409 });
  assert.equal((await models.FollowUp.findById(sameTime.task._id)).status, 'in_progress');
  const c = await make();
  const concurrent = await Promise.allSettled([fencedClose(c), fencedClose(c)]);
  assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await models.Report.findById(c.evidence[0].row._id)).outcomeEvidenceLock, null);
  const d = await make();
  const child = require('node:child_process').spawnSync(process.execPath,
    [__filename, db, 'crash', String(d.task._id), String(d.evidence[0].row._id)], { env: process.env, encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.equal(child.status, 44, child.stderr);
  d.task = await models.FollowUp.findById(d.task._id).lean();
  assert.equal(d.task.status, 'in_progress');
  assert.equal(d.task.outcomeClosureIntent.status, 'running');
  assert.deepEqual(d.task.outcomeClosureIntent.input, d.body);
  assert.equal((await models.Report.updateOne({ _id: d.evidence[0].row._id }, { $set: { value: 'unsafe' } })).modifiedCount, 0);
  await assert.rejects(fencedClose({ ...d, body: { decision: 'new_plan' } }), { statusCode: 409 });
  assert.equal((await fencedClose(d)).status, 'completed');
  assert.equal((await models.Report.findById(d.evidence[0].row._id)).outcomeEvidenceLock, null);
  console.log('PASS real Mongo: source update/save/delete and parent writes blocked; unlock; stale evidence rejects; concurrent single winner; exit44 preserves intent and exact retry resumes');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
