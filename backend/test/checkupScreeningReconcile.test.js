const test = require('node:test');
const assert = require('node:assert/strict');
const { suggest, categoryKeys, loadEvidence, sameCheckupRound, reconcile } = require('../src/utils/checkupScreeningReconcile');

const plan = { year: 2026, checkupDate: '2026-05-15', items: [
  { _id: 'p1', name: '血常规', status: 'pending' },
  { _id: 'p2', name: '肝脏超声', status: 'pending', itemId: 'exam' },
] };

test('exact name and one confirmed category match audited same-year reports', () => {
  const key = 'root|超声检查|肝脏超声';
  const reports = [{ _id: 'r1', audit_status: 'audited', checkDate: '2026-05-01', reportItems: [
    { name: '血常规检查', orderName: '血常规', value: '已检' }, { name: '肝彩超', screeningKey: key, classificationSource: 'manual', findings: '原件所见' },
  ] }];
  assert.deepEqual(suggest(plan, reports, new Map([['exam', key]])).map(row => row.reportId), ['r1', 'r1']);
});

test('legacy completed item without report can gain strict evidence without changing its completion time', async () => {
  const legacy = { ...plan, patientId: 'patient', items: [{ _id: 'p1', name: '血常规', status: 'completed', completedAt: '2026-05-02', reportId: null }] };
  const reports = [{ _id: 'r1', audit_status: 'audited', checkDate: '2026-05-01', reportItems: [{ name: '血常规', value: '已检' }] }];
  const empty = { find: () => ({ select: () => ({ lean: async () => [] }) }) };
  let update;
  await reconcile(legacy, { HealthPlan: { updateOne: async (_filter, change) => { update = change; return { modifiedCount: 1 }; } },
    MedicalReport: { find: () => ({ select: () => ({ lean: async () => reports }) }) },
    LabTestOrder: empty, SpecialExam: empty, FunctionalMedicineTest: empty, ProjectCategory: empty });
  assert.equal(update.$set['items.$.reportId'], 'r1');
  assert.equal(update.$set['items.$.completedAt'], undefined);
});

test('unreviewed, previous-year, duplicate reports and duplicate plan names do not auto-link', () => {
  const reports = [
    { _id: 'r1', audit_status: 'unaudited', checkDate: '2026-05-01', reportItems: [{ name: '血常规', value: '已检' }] },
    { _id: 'r2', audit_status: 'audited', checkDate: '2025-05-01', reportItems: [{ name: '血常规', value: '已检' }] },
    { _id: 'r3', audit_status: 'audited', checkDate: '2026-05-01', reportItems: [{ name: '血常规', value: '已检' }] },
    { _id: 'r4', audit_status: 'audited', checkDate: '2026-06-01', reportItems: [{ name: '血常规', value: '已检' }] },
  ];
  assert.equal(suggest(plan, reports)[0].reportId, null);
  assert.equal(suggest({ ...plan, items: [plan.items[0], { ...plan.items[0], _id: 'p3' }] }, [reports[2]])[0].reportId, null);
});

test('a heading without a reviewed result and a clinical note never auto-complete checkups', () => {
  const rows = suggest(plan, [
    { _id: 'r1', audit_status: 'audited', checkDate: '2026-05-01', reportItems: [{ name: '血常规' }] },
    { _id: 'r2', audit_status: 'audited', checkDate: '2026-05-01', documentCategory: 'outpatient_record', reportItems: [{ name: '血常规', value: '已检' }] },
  ]);
  assert.equal(rows[0].reportId, null);
});

test('a tentative classification is only a manual candidate', () => {
  const key = 'root|超声检查|肝脏超声';
  const rows = suggest(plan, [{ _id: 'r1', audit_status: 'audited', checkDate: '2026-05-01',
    reportItems: [{ name: '肝彩超', screeningKey: key, matchConfidence: 0.7, findings: '原件所见' }] }],
  new Map([['exam', key]]));
  assert.equal(rows[1].reportId, null);
});

test('a prior exam in the same year cannot satisfy a later checkup round automatically', () => {
  const rows = suggest({ ...plan, checkupDate: '2026-11-15' }, [{ _id: 'r1', audit_status: 'audited',
    checkDate: '2026-05-01', reportItems: [{ name: '血常规', value: '已检' }] }]);
  assert.equal(rows[0].reportId, null);
});

test('a nearby prior-year exam is not linked automatically to a January checkup', () => {
  const nextYearPlan = { ...plan, year: 2027, checkupDate: '2027-01-15' };
  const near = { _id: 'near', audit_status: 'audited', checkDate: '2026-12-20', reportItems: [{ name: '血常规', value: '已检' }] };
  const far = { ...near, _id: 'far', checkDate: '2026-10-01' };
  assert.equal(suggest(nextYearPlan, [near])[0].reportId, null);
  assert.equal(suggest(nextYearPlan, [far])[0].reportId, null);
  assert.equal(sameCheckupRound(nextYearPlan, near), false);
});

test('evidence lookup excludes reports outside the plan year even when dates are nearby', async () => {
  let reportFilter;
  const empty = { find: () => ({ select: () => ({ lean: async () => [] }) }) };
  const models = { MedicalReport: { find: filter => {
    reportFilter = filter;
    return { select: () => ({ lean: async () => [] }) };
  } }, LabTestOrder: empty, SpecialExam: empty, FunctionalMedicineTest: empty, ProjectCategory: empty };
  await loadEvidence({ ...plan, patientId: 'patient', year: 2027, checkupDate: '2027-01-15' }, models);
  assert.equal(reportFilter.checkDate.$gte, '2027-01-01');
  assert.equal(reportFilter.checkDate.$lte, '2027-03-01');
  reportFilter = null;
  await loadEvidence({ ...plan, checkupDate: null }, models);
  assert.equal(reportFilter, null);
});

test('a category key is based on the full active tree path', () => {
  const keys = categoryKeys([
    { _id: 'root', name: '一般检查', status: 'active' },
    { _id: 'parent', name: '超声检查', parent: 'root', status: 'active' },
    { _id: 'leaf', name: '肝脏超声', parent: 'parent', status: 'active' },
  ]);
  assert.equal(keys.get('leaf'), 'root|超声检查|肝脏超声');
});
