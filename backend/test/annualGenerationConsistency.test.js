const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprint, reuseAnnualGeneration, validateAnnualRaw } = require('../src/utils/annualGenerationConsistency');
function store() {
  const docs = new Map();
  return { docs, async findOne(q) { return structuredClone(docs.get(q._id)); }, async insertOne(d) { if (docs.has(d._id)) throw Object.assign(new Error(), { code: 11000 }); docs.set(d._id, structuredClone(d)); }, async updateOne(q, update) { const d = docs.get(q._id); if (!d || Object.keys(q).some(k => d[k] !== q[k])) return { modifiedCount: 0 }; Object.assign(d, structuredClone(update.$set)); return { modifiedCount: 1 }; } };
}
const empty = () => ({ medical_treatment: [], checkup_completion: [], abnormal_followup: [], vaccine: [], annual_checkup: {}, templateNodes: [] });
test('same sources three requests return identical content with one call; changed sources create revision', async () => {
  const db = store(); let calls = 0;
  const generate = async () => ({ count: ++calls });
  const a = await reuseAnnualGeneration(db, { patientId: 'p', source: 1 }, generate);
  const b = await reuseAnnualGeneration(db, { source: 1, patientId: 'p' }, generate);
  const c = await reuseAnnualGeneration(db, { patientId: 'p', source: 1 }, generate);
  assert.deepEqual(a.raw, b.raw); assert.deepEqual(b.raw, c.raw); assert.equal(calls, 1);
  await reuseAnnualGeneration(db, { patientId: 'p', source: 2 }, generate); assert.equal(calls, 2);
  assert.notEqual(fingerprint({ patientId: 'p' }), fingerprint({ patientId: 'other' }));
});
test('parallel duplicate is blocked; validation failure does not poison later explicit retry', async () => {
  const db = store(); let finish;
  const first = reuseAnnualGeneration(db, { patientId: 'p' }, () => new Promise(resolve => { finish = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(reuseAnnualGeneration(db, { patientId: 'p' }, async () => 'wrong'), /正在生成/);
  finish('right'); await first;
  await assert.rejects(reuseAnnualGeneration(db, { patientId: 'bad' }, async () => { throw new Error('validation'); }), /validation/);
  assert.equal((await reuseAnnualGeneration(db, { patientId: 'bad' }, async () => 'repaired')).raw, 'repaired');
});
test('missing sections and template mismatch throw instead of dropping records', () => {
  assert.throws(() => validateAnnualRaw({}, []), /缺少/);
  const raw = empty(); raw.abnormal_followup = [{ standardPlanId: 'wrong', reason: 'reason' }];
  assert.throws(() => validateAnnualRaw(raw, []), /模板不匹配/);
});
test('coverage cannot claim included without linked record; missing and invented references rejected', () => {
  const raw = empty(), evidence = [{ id: 'known' }];
  assert.throws(() => validateAnnualRaw(raw, [], evidence), /逐项核对/);
  raw.evidenceCoverage = [{ sourceId: 'known', status: 'included', reason: 'included' }];
  assert.throws(() => validateAnnualRaw(raw, [], evidence), /遗漏/);
  raw.evidenceCoverage[0].status = 'deferred'; assert.equal(validateAnnualRaw(raw, [], evidence), raw);
});
test('annual review scope uses current year and excludes archived and unrelated daily/nutrition reviews', () => {
  const q = require('../src/utils/annualCaseReviewScope').annualCaseReviewQuery('p', 2026);
  assert.equal(q.status.$ne, 'archived'); assert.deepEqual(q.$and[0].$or[0].reviewType.$in, ['annual', 'medical', 'specialty', 'checkup']);
  assert.equal(q.$and[1].$or[0]['conclusion.confirmedAt'].$gte.toISOString(), '2025-12-31T16:00:00.000Z');
});
