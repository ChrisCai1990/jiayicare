const test = require('node:test'), assert = require('node:assert/strict');
const { supplementChanges, applySupplement } = require('../../shared/annualSupplement.cjs');
const { loadSupplement } = require('../src/utils/annualSupplementSources');
const id = '123456789012345678901234';
const fake = (rows, inspect = () => {}) => ({ find(query) { inspect(query); return { select() { return this; }, sort() { return this; }, async lean() { return rows; } }; } });
test('explicit confirmed reviews can be any type; ownership/archive/approval constrained at query', async () => {
  const review = { _id: id, reviewType: 'custom', conclusion: { status: 'confirmed', content: '顾问确认内容' } };
  const result = await loadSupplement({ reviewIds: [id, id] }, 'patient', fake([review], query => {
    assert.equal(query.user, 'patient'); assert.equal(query['conclusion.status'], 'confirmed'); assert.deepEqual(query.status, { $ne: 'archived' }); assert.ok(!query.reviewType);
    assert.deepEqual(query._id.$in, [id]);
  }), fake([]));
  assert.equal(result.reviews[0], review);
  await assert.rejects(loadSupplement({ reviewIds: [id] }, 'patient', fake([]), fake([])), /未确认或不属于/);
  await assert.rejects(loadSupplement({ reportIds: [id] }, 'patient', fake([]), fake([])), /未确认或不属于/);
});
test('notes require explicit advisor confirmation; invalid selection fails without source queries', async () => {
  const noQuery = fake([], () => assert.fail('should not query'));
  for (const input of [{}, { reviewIds: ['bad'] }, { note: '尚未确认' }, { note: 'a'.repeat(4001), noteConfirmed: true }]) {
    await assert.rejects(loadSupplement(input, 'p', noQuery, noQuery));
  }
  const result = await loadSupplement({ note: '顾问新增意见', noteConfirmed: true }, 'p', fake([]), fake([]));
  assert.equal(result.note, '顾问新增意见');
});
test('supplement preserves existing modules and annual focus, no inferred cancellation or duplicate addition', () => {
  const base = { annual_checkup: { enabled: true, focus: '原项目', date: '2027-05-01', sourceIds: ['old'] }, medical_treatment: { records: [{ department: '眼科', reason: '原原因', hospital: '已选医院', serviceMode: 'managed' }] }, vaccine: { records: [{ name: '已安排' }] } };
  const proposed = { annual_checkup: { enabled: true, focus: '原项目\n胃肠镜', date: '2027-06-01', sourceIds: ['new'] }, abnormal_followup: { records: [{ items: '新增复查' }] } };
  const changes = supplementChanges(base, proposed), result = applySupplement(base, changes);
  assert.equal(result.annual_checkup.focus, '原项目\n胃肠镜'); assert.equal(result.annual_checkup.date, '2027-05-01');
  assert.deepEqual(result.medical_treatment, base.medical_treatment); assert.deepEqual(result.vaccine, base.vaccine);
  assert.equal(supplementChanges(result, proposed).length, 0);
  assert.equal(base.annual_checkup.focus, '原项目');
  assert.deepEqual(applySupplement(base, []), base);
});
test('selected item changes preserve manual logistics, stale draft rejected', () => {
  const base = { medical_treatment: { records: [{ department: '眼科', reason: '旧', hospital: '已确认医院', expert: '医生', serviceMode: 'single', serviceType: 'escort_visit', followUpStaff: 'manager' }] } };
  const changes = supplementChanges(base, { medical_treatment: { records: [{ department: '眼科', reason: '新建议', hospital: '', serviceMode: 'reminder' }] } });
  const result = applySupplement(base, changes).medical_treatment.records[0];
  assert.equal(result.reason, '新建议'); assert.equal(result.hospital, '已确认医院'); assert.equal(result.serviceMode, 'single');
  base.medical_treatment.records[0].reason = '人工修改';
  assert.throws(() => applySupplement(base, changes), /已变化/);
});
test('default annual source scope includes confirmed checkup type without expanding all types automatically', () => {
  const q = require('../src/utils/annualCaseReviewScope').annualCaseReviewQuery('p', 2026);
  assert.ok(q.$and[0].$or[0].reviewType.$in.includes('checkup'));
  assert.ok(!q.$and[0].$or[0].reviewType.$in.includes('custom'));
});

test('actual revision endpoint saves only internal proposal, never alters published plan or tasks', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
  const start = source.indexOf("router.post('/patients/:id/annual-supplement-revision'");
  const first = source.indexOf('async (req, res)', start), end = source.indexOf('\n});', first);
  const date = new Date('2026-09-23T00:00:00Z');
  for (const [role, visible, stale, expected] of [['healthManager', true, false, 403], ['familyDoctor', false, false, 403], ['familyDoctor', true, true, 409], ['familyDoctor', true, false, 200]]) {
    let writes = 0;
    const run = vm.runInNewContext('(' + source.slice(first, end + 2) + ')', { Date,
      getVisiblePlanPatientIds: async () => visible ? ['p'] : [], AiCaseReview: fake([]), MedicalReport: fake([]),
      AnnualPlan: { findOne: () => ({ lean: async () => ({ _id: id, updatedAt: date, pushedAt: date, frozenAt: date, moduleData: {} }) }), updateOne: async (filter, update) => {
        writes++; assert.deepEqual(Object.keys(update), ['$push']); assert.ok(update.$push.supplementRevisions); assert.equal(filter.updatedAt, date); return { modifiedCount: 1 };
      } },
      require: name => name.endsWith('/healthManagementRollout') ? { enabledForPatient: () => true } : name.includes('shared/annualSupplement') ? require('../../shared/annualSupplement.cjs') : require(name.replace('../utils/', '../src/utils/')),
    });
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await run({ staff: { role, _id: 'staff' }, params: { id: 'p' }, body: { planId: id, baseUpdatedAt: stale ? 'old' : date.toISOString(), sources: { note: '顾问补充', noteConfirmed: true }, changes: [{ key: 'annual_checkup', index: 0, before: null, after: { enabled: true, focus: '新增项目' } }] } }, res);
    assert.equal(res.code, expected); assert.equal(writes, expected === 200 ? 1 : 0);
  }
});
