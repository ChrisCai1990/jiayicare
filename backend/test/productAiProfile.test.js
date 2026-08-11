const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAiProfile,
  getAiProfileGaps,
  resolveProductPrices,
  isAiRecommendable,
  buildAiCatalogEntry,
} = require('../src/utils/productAiProfile');

test('normalizeAiProfile trims, removes blanks and deduplicates lists', () => {
  const profile = normalizeAiProfile({
    enabledForRecommendation: true,
    targetNeeds: [' 体检 ', '', '体检'],
    nextAction: 'invalid',
  });
  assert.deepEqual(profile.targetNeeds, ['体检']);
  assert.equal(profile.nextAction, 'inquire');
});

test('enabled products remain unavailable to AI until required rules are complete', () => {
  const product = { status: 'on', aiProfile: { enabledForRecommendation: true, targetNeeds: ['体检'] } };
  assert.equal(isAiRecommendable(product), false);
  assert.ok(getAiProfileGaps(product).includes('缺少适用人群'));
});

test('price resolution prefers active SKUs, then service prices, then base price', () => {
  assert.deepEqual(resolveProductPrices({
    name: '服务', originalPrice: 999,
    servicePrices: [{ label: '旧规格', price: 299 }],
    skus: [{ code: 'A', label: '启用规格', price: 399, active: true }, { code: 'B', label: '停用规格', price: 1, active: false }],
  }), [{ code: 'A', label: '启用规格', price: 399 }]);
  assert.equal(resolveProductPrices({ name: '服务', originalPrice: 999, servicePrices: [{ label: '规格', price: 299 }] })[0].price, 299);
  assert.equal(resolveProductPrices({ name: '服务', originalPrice: 999 })[0].price, 999);
});

test('catalog entry contains operational AI rules but excludes internal notes', () => {
  const product = {
    _id: 'p1', name: '健康服务', category: '健康管理', status: 'on', originalPrice: 299,
    aiProfile: {
      enabledForRecommendation: true,
      targetNeeds: ['健康咨询'], suitableFor: ['一般健康管理需求'], requiredQuestions: ['希望解决什么？'],
      promiseLimits: ['不承诺效果'], handoffConditions: ['医疗问题'], operatorNotes: '内部信息',
    },
  };
  const entry = buildAiCatalogEntry(product);
  assert.equal(entry.productId, 'p1');
  assert.deepEqual(entry.targetNeeds, ['健康咨询']);
  assert.equal(Object.hasOwn(entry, 'operatorNotes'), false);
});
