const test = require('node:test');
const assert = require('node:assert/strict');
const { isSupplementOrder, buildSupplementDraft } = require('../src/utils/orderSupplementArchive');

test('supplement workflow products are recognized without guessing from checkout text', () => {
  assert.equal(isSupplementOrder({ serviceWorkflowSnapshot: { key: 'supplement_supply' }, serviceName: '每日营养包' }), true);
  assert.equal(isSupplementOrder({ serviceWorkflowSnapshot: { key: 'fulfillment_only' }, serviceName: '体检服务' }), false);
});

test('paid supplement orders create a pending nutritionist-review draft with purchase facts only', () => {
  const draft = buildSupplementDraft({
    _id: 'order-1', user: 'patient-1', serviceName: '维生素D3', specificationLabel: '60粒/瓶', totalUnits: 2, orderNo: 'JY001',
  }, { name: '维生素D3', images: ['https://example.test/product.jpg'] });
  assert.equal(draft.aiStatus, 'pending');
  assert.equal(draft.sourceType, 'order');
  assert.equal(draft.sourceOrderId, 'order-1');
  assert.equal(draft.dosage, '待营养师确认');
  assert.equal(draft.frequency, '待营养师确认');
  assert.match(draft.note, /仅表示购买事实/);
  assert.match(draft.note, /订单号：JY001/);
});
