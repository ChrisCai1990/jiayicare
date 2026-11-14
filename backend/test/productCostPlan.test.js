const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProductCostPlan } = require('../src/utils/productCostPlan');

const product = { servicePrices: [{ label: '50分钟咨询' }], skus: [{ code: 'A1' }] };
const item = { category: 'external_service', name: '咨询师服务费', amountCents: 30000 };

test('product standard cost validates default and scoped items', () => {
  const plan = normalizeProductCostPlan({ expectedVersion: 0, defaultItems: [item],
    scopes: [{ scopeType: 'servicePrice', scopeKey: '50分钟咨询', items: [item] }], note: '报价' }, product);
  assert.equal(plan.defaultItems[0].amountCents, 30000);
  assert.equal(plan.scopes[0].scopeKey, '50分钟咨询');
  assert.throws(() => normalizeProductCostPlan({ ...plan, scopes: [{ scopeType: 'sku', scopeKey: 'missing', items: [] }] }, product));
  assert.throws(() => normalizeProductCostPlan({ ...plan, defaultItems: [{ ...item, amountCents: -1 }] }, product));
  assert.throws(() => normalizeProductCostPlan({ ...plan, expectedVersion: -1 }, product));
});
