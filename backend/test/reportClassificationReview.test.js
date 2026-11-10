const test = require('node:test');
const assert = require('node:assert/strict');
const { findUnconfirmedMultiClassifiedItems, collapseStaleAutomaticCandidates } = require('../src/utils/reportClassificationReview');

test('multi-classified results require an explicit reviewer choice', () => {
  const base = { name: '脂蛋白(a)', screeningKeys: ['category-a', 'category-b'], screeningKey: 'category-a' };
  assert.deepEqual(findUnconfirmedMultiClassifiedItems([base]), [base]);
  assert.deepEqual(findUnconfirmedMultiClassifiedItems([{ ...base, classificationSource: 'manual', classificationReviewedBy: 'reviewer-id' }]), []);
  assert.deepEqual(findUnconfirmedMultiClassifiedItems([{ ...base, classificationSource: 'manual' }]), [{ ...base, classificationSource: 'manual' }]);
  assert.deepEqual(findUnconfirmedMultiClassifiedItems([{ ...base, screeningKeys: ['category-a'] }]), []);
  assert.deepEqual(findUnconfirmedMultiClassifiedItems([{ ...base, name: '' }]), []);
});

test('stale automatic alternatives collapse only when current matching confirms the primary destination', async () => {
  const old = { name: '载脂蛋白A1', screeningKey: 'lipid-panel', screeningKeys: ['lipid-panel', 'lipoprotein-a'] };
  const [current] = await collapseStaleAutomaticCandidates([old], async () => [{ screeningKey: 'lipid-panel', screeningKeys: ['lipid-panel'] }]);
  assert.deepEqual(current.screeningKeys, ['lipid-panel']);
  assert.deepEqual(findUnconfirmedMultiClassifiedItems([current]), []);

  const [stillAmbiguous] = await collapseStaleAutomaticCandidates([old], async () => [{ screeningKey: 'lipid-panel', screeningKeys: ['lipid-panel', 'lipoprotein-a'] }]);
  assert.deepEqual(stillAmbiguous.screeningKeys, old.screeningKeys);
  assert.equal(findUnconfirmedMultiClassifiedItems([stillAmbiguous]).length, 1);

  const manual = { ...old, classificationSource: 'manual', classificationReviewedBy: 'reviewer-id' };
  const [unchanged] = await collapseStaleAutomaticCandidates([manual], async () => { throw new Error('manual choice must not be rematched'); });
  assert.equal(unchanged, manual);
});
