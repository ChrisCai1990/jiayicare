const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../src/models/Order');

test('historical orders with an empty initiation source can be saved after fulfillment', () => {
  const historical = Order.hydrate({ initiationSource: '', status: 'completed', tradeStatus: 'completed' });
  historical.commissionStatus = 'none';
  assert.equal(historical.validateSync()?.errors?.initiationSource, undefined);

  const invalid = Order.hydrate({ initiationSource: 'unknown_source' });
  assert.ok(invalid.validateSync()?.errors?.initiationSource);
});
