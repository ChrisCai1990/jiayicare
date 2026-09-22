// Explicit local-only regression; no production configuration or AI calls.
const assert = require('node:assert/strict'), mongoose = require('mongoose');
const { reportParseJobUpdate } = require('../src/utils/reportParseJobUpdate');
async function main() {
  await mongoose.connect(`mongodb://127.0.0.1:27135/parse_test_${require('crypto').randomBytes(12).toString('hex')}`, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
  const Report = require('../src/models/MedicalReport');
  for (const initial of [null, undefined, { status: 'failed', progress: { nextPage: 3 }, imagePages: { 1: { done: true } } }]) {
    const raw = { aiStatus: 'none', pageParseStatus: null, ...(initial === undefined ? {} : { parseJob: initial }) };
    const { insertedId } = await Report.collection.insertOne(raw);
    if (initial === null) await assert.rejects(Report.findOneAndUpdate({ _id: insertedId }, { 'parseJob.actorId': 'synthetic' }), /Cannot create field/);
    const filter = { _id: insertedId, aiStatus: { $ne: 'processing' }, 'parseJob.status': { $ne: 'paused' }, 'pageParseStatus.status': { $ne: 'processing' } };
    const results = await Promise.all([1, 2].map(() => Report.findOneAndUpdate(filter, reportParseJobUpdate({ status: 'processing', actorId: 'synthetic', startedAt: new Date() }, { aiStatus: 'processing' }))));
    assert.equal(results.filter(Boolean).length, 1);
    const saved = await Report.findById(insertedId).lean();
    assert.equal(saved.parseJob.status, 'processing');
    if (initial?.progress) { assert.deepEqual(saved.parseJob.progress, initial.progress); assert.deepEqual(saved.parseJob.imagePages, initial.imagePages); }
  }
  const r = await Report.collection.insertOne({ aiStatus: 'failed', parseJob: { status: 'paused', progress: { nextPage: 2 } } });
  assert.equal(await Report.findOneAndUpdate({ _id: r.insertedId, 'parseJob.status': { $ne: 'paused' } }, reportParseJobUpdate({ status: 'processing' })), null);
  console.log('PASS null/missing/checkpoint jobs, old failure reproduced, concurrent single start, paused preserved; no AI called');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => mongoose.disconnect());
