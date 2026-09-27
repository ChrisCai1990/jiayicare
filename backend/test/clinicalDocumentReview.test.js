const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeClinicalReview, validateClinicalReview } = require('../src/utils/clinicalDocumentReview');

test('prescription review requires explicit source confirmation and safe medication fields', () => {
  const review = normalizeClinicalReview('prescription_order', {
    sourceReviewed: true, reviewConclusion: '已核对处方原件。', medicationDecision: 'has_medications',
    medications: [{ includeInCurrentMedication: true, name: '氨氯地平', dosage: '5mg', frequency: '每日一次' }],
  });
  assert.equal(validateClinicalReview('prescription_order', review), null);
  assert.equal(validateClinicalReview('prescription_order', { ...review, sourceReviewed: false }), '请确认已核对原始资料后再审核通过');
  assert.match(validateClinicalReview('prescription_order', { ...review, medications: [{ ...review.medications[0], frequency: '' }] }), /剂量和频次/);
});

test('outpatient and inpatient reviews remain structured documents instead of medication drafts', () => {
  for (const category of ['outpatient_record', 'inpatient_record']) {
    const review = normalizeClinicalReview(category, { sourceReviewed: true, reviewConclusion: '已按原件完成结构化核对。', medicationInstruction: '原文留存，待处方单独审核。' });
    assert.equal(validateClinicalReview(category, review), null);
  }
});
