const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTodo, loadAnnualPlanCreationTodos, planYear } = require('../src/utils/annualPlanCreationTodos');

const now = new Date('2026-11-17T04:00:00Z');
const patient = { _id: 'p1', name: '会员甲', membershipTier: 'annual', serviceStartDate: '2026-10-29', createdAt: now };

test('active service year comes from its start date, including cross-year service', () => {
  assert.equal(planYear({ startDate: '2025-12-01' }, now), 2025);
  assert.equal(planYear({ startDate: '' }, now), 2026);
  assert.equal(planYear({ startDate: '2023-01-01' }, now), 2026);
});

test('missing plan and unfinished draft remain actionable, published plan closes creation task', () => {
  const missing = buildTodo(patient, 2026, [], now);
  assert.equal(missing.type, 'annual_plan_create');
  assert.equal(missing.link, '/patients/p1/annual-health?year=2026');
  const draft = { patientId: 'p1', year: 2026, createdAt: now, pushedAt: null };
  assert.match(buildTodo(patient, 2026, [draft], now).label, /草稿/);
  assert.equal(buildTodo(patient, 2026, [{ ...draft, pushedAt: now }], now), null);
  assert.equal(buildTodo(patient, 2026, [{ ...draft, formalizedAt: now }], now), null);
});

test('only the assigned advisor receives active annual members without a published plan', async () => {
  let userFilter;
  const users = {
    find: filter => {
      userFilter = filter;
      return { select: () => ({ lean: async () => [patient, { ...patient, _id: 'p2' }, { ...patient, _id: 'p3', membershipTier: 'basic' }, { ...patient, _id: 'p4' }] }) };
    },
  };
  const plans = { find: () => ({ select: () => ({ lean: async () => [{ patientId: 'p2', year: 2026, pushedAt: now }] }) }) };
  const packages = { find: () => ({ select: () => ({ lean: async () => [] }) }) };
  const reports = { find: () => ({ select: () => ({ lean: async () => [
    { user: 'p1', _id: 'r1', audit_status: 'audited', documentCategory: 'physical_exam', checkDate: '2026-09-10', examConclusion: '完整体检结论', advisorInterpretationConfirmedAt: now },
    { user: 'p4', _id: 'r4', audit_status: 'audited', documentCategory: 'physical_exam', checkDate: '2026-07-01', examConclusion: '历史体检结论', advisorInterpretationConfirmedAt: now },
  ] }) }) };
  const deps = {
    User: users, AnnualPlan: plans, ServicePackage: packages, MedicalReport: reports,
    resolveServiceAccess: async () => ({ active: true, startDate: '2026-10-29' }),
  };
  assert.deepEqual(await loadAnnualPlanCreationTodos({ role: 'healthManager', _id: 'advisor' }, now, deps), []);
  const todos = await loadAnnualPlanCreationTodos({ role: 'familyDoctor', _id: 'advisor' }, now, deps);
  assert.equal(String(userFilter.assignedFamilyDoctor), 'advisor');
  assert.deepEqual(todos.map(todo => todo.patientId), ['p1']);
});
