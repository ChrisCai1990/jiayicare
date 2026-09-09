const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeInsuranceOperations } = require('../src/utils/insuranceOperations');

test('无案件时只返回真实参保人数，不制造效果指标', () => {
  assert.deepEqual(summarizeInsuranceOperations([], 17), {
    enrolledMembers: 17, totalCases: 0, byStatus: {}, byScenario: {}, submittedClaims: 0, paidClaims: 0,
    claimPaidRate: 0, averageResolutionHours: 0,
    financials: { totalMemberPaid: 0, totalDirectBilling: 0, totalInsurancePaid: 0 },
  });
});

test('按真实案件累计场景、赔付率、处理时长和费用', () => {
  const summary = summarizeInsuranceOperations([
    { status:'closed', scenario:'outpatient', claim:{ status:'paid', submittedAt:'2026-09-01T00:00:00Z', paidAt:'2026-09-03T00:00:00Z' }, financials:{ memberPaidAmount:100, directBillingAmount:900, finalPaidAmount:800 } },
    { status:'reviewing', scenario:'inpatient', claim:{ status:'reviewing', submittedAt:'2026-09-02T00:00:00Z' }, financials:{ memberPaidAmount:200 } },
  ], 17);
  assert.equal(summary.totalCases, 2);
  assert.deepEqual(summary.byScenario, { outpatient:1, inpatient:1 });
  assert.equal(summary.claimPaidRate, 0.5);
  assert.equal(summary.averageResolutionHours, 48);
  assert.deepEqual(summary.financials, { totalMemberPaid:300, totalDirectBilling:900, totalInsurancePaid:800 });
});
