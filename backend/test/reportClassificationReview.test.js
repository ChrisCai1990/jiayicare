const test = require('node:test');
const assert = require('node:assert/strict');
const { findUnconfirmedMultiClassifiedItems } = require('../src/utils/reportClassificationReview');

test('multi-classified results require an explicit reviewer choice', () => {
  const base = { name: '脂蛋白(a)', screeningKeys: ['category-a', 'category-b'], screeningKey: 'category-a' };
  assert.deepEqual(findUnconfirmedMultiClassifiedItems([base]), [base]);
  assert.deepEqual(findUnconfirmedMultiClassifiedItems([{ ...base, classificationSource: 'manual', classificationReviewedBy: 'reviewer-id' }]), []);
  assert.deepEqual(findUnconfirmedMultiClassifiedItems([{ ...base, classificationSource: 'manual' }]), [{ ...base, classificationSource: 'manual' }]);
  assert.deepEqual(findUnconfirmedMultiClassifiedItems([{ ...base, screeningKeys: ['category-a'] }]), []);
  assert.deepEqual(findUnconfirmedMultiClassifiedItems([{ ...base, name: '' }]), []);
});
