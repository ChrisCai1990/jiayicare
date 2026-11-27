const test = require('node:test');
const assert = require('node:assert/strict');
const { enabled, enabledForPlan, enabledForNewPlan, enabledForYear, enabledForTask } = require('../src/utils/annualFlowPilot');

const jin = '6a4ef1980f2291549b4ffd8d';
const other = '6a4ef1980f2291549b4ffd8e';

test('historical phase review access stays scoped', () => {
  const env = { MANAGEMENT_REVIEW_MODE: 'phase_assessment', MANAGEMENT_REVIEW_PATIENT_IDS: jin };
  assert.equal(enabled(jin, env), true);
  assert.equal(enabled(other, env), false);
  assert.equal(enabled(jin, { ...env, MANAGEMENT_REVIEW_MODE: 'allowlist' }), false);
  assert.equal(enabled(jin, { ...env, MANAGEMENT_REVIEW_PATIENT_IDS: '' }), false);
});

test('all annual plans and linked tasks use version two', () => {
  const env = { ANNUAL_FLOW_NEW_PLAN_MODE: 'all', MANAGEMENT_REVIEW_MODE: 'phase_assessment', MANAGEMENT_REVIEW_PATIENT_IDS: jin };
  assert.equal(enabled(jin, env), true);
  assert.equal(enabled(other, env), false);
  assert.equal(enabledForNewPlan(other, {}), true);
  assert.equal(enabledForPlan(null), false);
  assert.equal(enabledForTask({patientId:other,sourceAnnualPlanId:jin}, {}), true);
  assert.equal(enabledForPlan({ patientId: other }, env), true);
  assert.equal(enabledForPlan({ patientId: other, flowVersion: 1 }, env), true);
  assert.equal(enabledForPlan({ patientId: other, flowVersion: 2 }, env), true);
  assert.equal(enabledForPlan({ patientId: jin }, env), true);
  assert.equal(require('../src/utils/managementReviewPolicy').restored(other, env), false);
  assert.equal(enabledForTask({ patientId: other, formData: {} }, env), false);
  assert.equal(enabledForTask({ patientId: other, formData: { annualFlowVersion: 2 } }, env), true);
  assert.equal(enabledForTask({ patientId: jin, formData: {} }, env), true);
});

test('annual screening uses version two for every valid patient and year', async () => {
  assert.equal(await enabledForYear(other, 2026, {}), true);
  assert.equal(await enabledForYear('', 2026), false);
});
