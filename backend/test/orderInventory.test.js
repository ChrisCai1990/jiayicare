const test = require('node:test');
const assert = require('node:assert/strict');

const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const { reserveProduct, releaseOrderInventory } = require('../src/utils/orderInventory');

test('the last limited item can only be reserved once', async (t) => {
  let stock = 1;
  const original = Product.updateOne;
  t.after(() => { Product.updateOne = original; });
  Product.updateOne = async (_filter, update) => {
    if (stock < 1) return { modifiedCount: 0 };
    stock += update.$inc.stock;
    return { modifiedCount: 1 };
  };
  const product = { _id: 'product', status: 'on', stock: 1, stockLimited: true };
  const results = await Promise.all([reserveProduct(product), reserveProduct(product)]);
  assert.deepEqual(results.map(result => result.available).sort(), [false, true]);
  assert.equal(stock, 0);
});

test('unlimited product does not change stock', async () => {
  assert.deepEqual(await reserveProduct({ status: 'on', stock: 0, stockLimited: false }),
    { reserved: false, available: true });
});

test('cancel releases a reserved item once', async (t) => {
  let stock = 0;
  let claimed = false;
  const originalOrder = Order.findOneAndUpdate;
  const originalProduct = Product.updateOne;
  t.after(() => { Order.findOneAndUpdate = originalOrder; Product.updateOne = originalProduct; });
  Order.findOneAndUpdate = async () => {
    if (claimed) return null;
    claimed = true;
    return { _id: 'order' };
  };
  Product.updateOne = async (_filter, update) => { stock += update.$inc.stock; return { modifiedCount: 1 }; };
  const order = { _id: 'order', serviceId: 'product', inventoryReserved: true };
  assert.deepEqual(await Promise.all([releaseOrderInventory(order), releaseOrderInventory(order)]), [true, false]);
  assert.equal(stock, 1);
});
