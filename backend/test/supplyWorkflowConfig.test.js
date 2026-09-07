const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSupplyWorkflowConfig, isInternalProduct } = require('../src/utils/supplyWorkflowConfig');

test('Admin提前天数最少3天、最多30天', () => {
  assert.equal(normalizeSupplyWorkflowConfig({ medication: { leadDays: 1 } }).medication.leadDays, 3);
  assert.equal(normalizeSupplyWorkflowConfig({ supplement: { leadDays: 99 } }).supplement.leadDays, 30);
});

test('药品和营养素不能启用不属于本品类的履约方式', () => {
  const cfg = normalizeSupplyWorkflowConfig({
    medication: { allowedModes: ['hospital_assisted', 'internal_product'] },
    supplement: { allowedModes: ['online_assisted', 'hospital_assisted'] },
  });
  assert.deepEqual(cfg.medication.allowedModes, ['hospital_assisted']);
  assert.deepEqual(cfg.supplement.allowedModes, ['online_assisted']);
});

test('自研履约只匹配Admin配置的产品关键词', () => {
  const cfg = normalizeSupplyWorkflowConfig({ internalProductKeywords: ['营养改变生活'] });
  assert.equal(isInternalProduct('营养改变生活代餐粉', cfg), true);
  assert.equal(isInternalProduct('第三方复合维生素', cfg), false);
});
