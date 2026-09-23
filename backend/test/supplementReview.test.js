const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateApprovedSupplement, reviewedSupplementFields } = require('../src/utils/supplementReview');

test('order draft cannot be approved with unconfirmed use instructions', () => {
  const draft = { name: '维生素D', dosage: '待营养师确认', frequency: '待营养师确认' };
  assert.match(validateApprovedSupplement(draft), /剂量/);
  assert.equal(validateApprovedSupplement({ ...draft, dosage: '经核对的剂量', frequency: '经核对的频次' }), '');
});

test('review changes only editable fields and preserves order provenance', () => {
  const fields = reviewedSupplementFields({ name: '维生素D', dosage: '经核对的剂量', frequency: '经核对的频次',
    sourceOrderId: 'other-order', user: 'other-user', aiStatus: 'approved', imageUrls: ['a', '', 42] });
  assert.deepEqual(fields, { name: '维生素D', dosage: '经核对的剂量', frequency: '经核对的频次', imageUrls: ['a'] });
});
