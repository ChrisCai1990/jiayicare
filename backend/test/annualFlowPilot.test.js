const test = require('node:test');
const assert = require('node:assert/strict');
const { enabled, enabledForTask } = require('../src/utils/annualFlowPilot');

const jin = '6a4ef1980f2291549b4ffd8d';
const other = '6a4ef1980f2291549b4ffd8e';

test('annual flow pilot opens only the selected patient in restored phase mode', () => {
  const env = { MANAGEMENT_REVIEW_MODE: 'phase_assessment', MANAGEMENT_REVIEW_PATIENT_IDS: jin };
  assert.equal(enabled(jin, env), true);
  assert.equal(enabled(other, env), false);
  assert.equal(enabled(jin, { ...env, MANAGEMENT_REVIEW_MODE: 'allowlist' }), false);
  assert.equal(enabled(jin, { ...env, MANAGEMENT_REVIEW_PATIENT_IDS: '' }), false);
});

test('annual flow opens for all without changing phase-review mode', () => {
  const env = { ANNUAL_FLOW_MODE: 'all', MANAGEMENT_REVIEW_MODE: 'phase_assessment', MANAGEMENT_REVIEW_PATIENT_IDS: jin };
  assert.equal(enabled(jin, env), true);
  assert.equal(enabled(other, env), true);
  assert.equal(require('../src/utils/managementReviewPolicy').restored(other, env), false);
  assert.equal(enabledForTask({ patientId: other, formData: {} }, env), false);
  assert.equal(enabledForTask({ patientId: other, formData: { annualFlowVersion: 2 } }, env), true);
  assert.equal(enabledForTask({ patientId: jin, formData: {} }, env), true);
});
