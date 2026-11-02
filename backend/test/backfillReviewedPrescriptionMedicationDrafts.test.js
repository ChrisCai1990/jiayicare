const test = require('node:test');
const assert = require('node:assert/strict');
const { candidateFor } = require('../src/scripts/backfillReviewedPrescriptionMedicationDrafts');

const report = { _id: 'report-1', checkDate: '2026-10-13' };

test('legacy prescription row becomes a review candidate only with dose and frequency', () => {
  const candidate = candidateFor(report, {
    itemType: 'medication', medicationAction: 'create', name: '药品甲',
    referenceRange: '每次1片，每天2次', findings: '餐后口服',
  }, 0);
  assert.equal(candidate.sourceRecordKey, 'prescription_report_review:report-1:0:药品甲:1片:每天2次');
  assert.equal(candidate.method, '口服');
  assert.equal(candidate.timing, '餐后');
  assert.equal(candidateFor(report, { itemType: 'medication', medicationAction: 'create', name: '药品甲' }, 0).incomplete, true);
  assert.equal(candidateFor(report, { itemType: 'medication', medicationAction: 'keep', name: '药品甲' }, 0), null);
});
