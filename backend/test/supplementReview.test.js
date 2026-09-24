const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateApprovedSupplement, reviewedSupplementFields, canNutritionistEditOrderSupplement } = require('../src/utils/supplementReview');

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

test('nutritionist can save an order-created supplement, including legacy records without sourceType', () => {
  assert.equal(canNutritionistEditOrderSupplement({ sourceType: 'order' }, 'nutritionist'), true);
  assert.equal(canNutritionistEditOrderSupplement({ sourceOrderId: 'order-1' }, 'nutritionist'), true);
  assert.equal(canNutritionistEditOrderSupplement({ sourceType: 'order' }, 'healthManager'), false);
  assert.equal(canNutritionistEditOrderSupplement({ sourceType: 'manual' }, 'nutritionist'), false);
});
