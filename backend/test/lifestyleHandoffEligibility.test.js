const test = require('node:test');
const assert = require('node:assert/strict');
const { summaryTodos } = require('../src/utils/humanWorkbench');
const { lifestyleGenerationEligible, completedInServicePeriod } = require('../src/utils/lifestyleHandoffEligibility');

const approvedDoctor = { scope: 'doctor', generatedAt: '2026-10-01T00:00:00Z',
  doctorApprovedAt: '2026-10-02T00:00:00Z', sections: { medical_priority: { summary: '已核对' } } };
const patient = { _id: 'patient', assignedNutritionist: 'nutritionist', servicePackage: '年度服务',
  aiHealthSummary: { byYear: { 2026: { records: [approvedDoctor] } } } };
const now = new Date('2026-10-28T00:00:00Z');
const dependencies = {
  resolveServiceAccess: async () => ({ active: true, startDate: '2026-01-01', endDate: '2026-12-31' }),
  getAiEntitlements: async () => ({ aiHealthAnalysis: true }),
  checkupAnalysisReadiness: async () => ({ ready: true }),
  checkReportAuditGate: async () => null,
  dietaryPending: async () => false,
};

test('completed lifestyle review stays completed after a later doctor approval', () => {
  const reviewed = { ...approvedDoctor, nutritionApprovedAt: '2026-07-12T00:00:00Z',
    sections: { ...approvedDoctor.sections, lifestyle_assessment: { summary: '已完成' } } };
  const user = { ...patient, aiHealthSummary: { byYear: { 2026: { records: [reviewed] } } } };
  assert.deepEqual(summaryTodos(user, type => type === 'lifestyle_generate', now), []);
});

test('generation handoff requires entitlement and every upstream prerequisite', async () => {
  assert.equal(summaryTodos(patient, type => type === 'lifestyle_generate', now).length, 1);
  assert.equal(await lifestyleGenerationEligible(patient, 2026, dependencies), true);
  const cases = [
    { resolveServiceAccess: async () => ({ active: false }) },
    { getAiEntitlements: async () => ({ aiHealthAnalysis: false }) },
    { checkupAnalysisReadiness: async () => ({ ready: false }) },
    { checkReportAuditGate: async () => '有新增体检报告待健康顾问确认' },
    { dietaryPending: async () => true },
  ];
  for (const patch of cases) {
    assert.equal(await lifestyleGenerationEligible(patient, 2026, { ...dependencies, ...patch }), false);
  }
  assert.equal(await lifestyleGenerationEligible({ ...patient, assignedNutritionist: null }, 2026, dependencies), false);
  assert.equal(await lifestyleGenerationEligible({ ...patient, archiveReviewSnapshotAt: '2026-10-03T00:00:00Z' }, 2026, dependencies), false);
});

test('one approved lifestyle analysis fulfills the current service period', async () => {
  const old = { scope: 'nutrition', generatedAt: '2025-12-30T00:00:00Z',
    nutritionApprovedAt: '2026-01-03T00:00:00Z', sections: { lifestyle_assessment: { summary: '已完成' } } };
  const user = { ...patient, aiHealthSummary: { byYear: { 2025: { records: [old] }, 2026: { records: [approvedDoctor] } } } };
  assert.equal(completedInServicePeriod(user, { startDate: '2026-01-01', endDate: '2026-12-31' }), true);
  assert.equal(await lifestyleGenerationEligible(user, 2026, dependencies), false);
  assert.equal(completedInServicePeriod(user, { startDate: '2026-02-01', endDate: '2027-01-31' }), false);
});
