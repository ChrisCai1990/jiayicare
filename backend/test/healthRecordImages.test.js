const test = require('node:test');
const assert = require('node:assert/strict');
const {
  incomingImagePayloads,
  withSafeHealthRecordImages,
  withoutLegacyImageExtra,
} = require('../src/utils/healthRecordImages');

test('deduplicates legacy and current embedded image payloads', () => {
  const image = 'data:image/jpeg;base64,YWJj';
  assert.deepEqual(incomingImagePayloads({ imageUrl: image, images: [{ data: image }], extra: { imageUrl: image } }), [image]);
});

test('removes legacy image from extra without mutating other fields', () => {
  const extra = { imageUrl: 'data:image/jpeg;base64,YWJj', mealType: '早餐' };
  assert.deepEqual(withoutLegacyImageExtra(extra), { mealType: '早餐' });
  assert.equal(extra.imageUrl.startsWith('data:'), true);
});

test('never returns embedded base64 but preserves stored image URLs', () => {
  const embedded = withSafeHealthRecordImages({ extra: { imageUrl: 'data:image/jpeg;base64,YWJj', mealType: '午餐' } }, value => `signed:${value}`);
  assert.equal(embedded.imageUrl, '');
  assert.deepEqual(embedded.extra, { mealType: '午餐' });

  const stored = withSafeHealthRecordImages({ extra: { imageUrl: 'https://bucket/legacy.jpg' } }, value => `signed:${value}`);
  assert.equal(stored.imageUrl, 'signed:https://bucket/legacy.jpg');
  assert.deepEqual(stored.extra, {});
});
