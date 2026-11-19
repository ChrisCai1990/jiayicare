const test = require('node:test');
const assert = require('node:assert/strict');
const { enabled, enabledForPlan, enabledForNewPlan, enabledForYear, enabledForTask } = require('../src/utils/annualFlowPilot');
const AnnualPlan = require('../src/models/AnnualPlan');

const jin = '6a4ef1980f2291549b4ffd8d';
const other = '6a4ef1980f2291549b4ffd8e';

test('annual flow pilot opens only the selected patient in restored phase mode', () => {
  const env = { MANAGEMENT_REVIEW_MODE: 'phase_assessment', MANAGEMENT_REVIEW_PATIENT_IDS: jin };
  assert.equal(enabled(jin, env), true);
  assert.equal(enabled(other, env), false);
  assert.equal(enabled(jin, { ...env, MANAGEMENT_REVIEW_MODE: 'allowlist' }), false);
  assert.equal(enabled(jin, { ...env, MANAGEMENT_REVIEW_PATIENT_IDS: '' }), false);
});

test('new-plan rollout keeps existing plans and tasks on their original flow', () => {
  const env = { ANNUAL_FLOW_NEW_PLAN_MODE: 'all', MANAGEMENT_REVIEW_MODE: 'phase_assessment', MANAGEMENT_REVIEW_PATIENT_IDS: jin };
  assert.equal(enabled(jin, env), true);
  assert.equal(enabled(other, env), false);
  assert.equal(enabledForNewPlan(other, env), true);
  assert.equal(enabledForPlan({ patientId: other }, env), false);
  assert.equal(enabledForPlan({ patientId: other, flowVersion: 1 }, env), false);
  assert.equal(enabledForPlan({ patientId: other, flowVersion: 2 }, env), true);
  assert.equal(enabledForPlan({ patientId: jin }, env), true);
  assert.equal(require('../src/utils/managementReviewPolicy').restored(other, env), false);
  assert.equal(enabledForTask({ patientId: other, formData: {} }, env), false);
  assert.equal(enabledForTask({ patientId: other, formData: { annualFlowVersion: 2 } }, env), true);
  assert.equal(enabledForTask({ patientId: jin, formData: {} }, env), true);
});

test('year access follows the saved plan before the new-plan switch', async t => {
  const env = { ANNUAL_FLOW_NEW_PLAN_MODE: 'all', MANAGEMENT_REVIEW_MODE: 'phase_assessment', MANAGEMENT_REVIEW_PATIENT_IDS: jin };
  let rows = [{ patientId: other, flowVersion: 1, pushedAt: new Date() }];
  t.mock.method(AnnualPlan, 'find', () => ({ select: () => ({ sort: () => ({ lean: async () => rows }) }) }));
  assert.equal(await enabledForYear(other, 2026, env), false);
  rows = [{ patientId: other, flowVersion: 2 }];
  assert.equal(await enabledForYear(other, 2026, env), true);
  rows = [];
  assert.equal(await enabledForYear(other, 2026, env), true);
});
