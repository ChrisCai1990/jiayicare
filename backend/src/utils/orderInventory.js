const Product = require('../models/Product');
const Order = require('../models/Order');

async function reserveProduct(product) {
  if (!product) return { reserved: false, available: true };
  if (product.status !== 'on') return { reserved: false, available: false };
  // Existing products with stock=0 mean unlimited; positive legacy stock is limited.
  if (!product.stockLimited && Number(product.stock) === 0) return { reserved: false, available: true };
  const updated = await Product.updateOne(
    { _id: product._id, status: 'on', stock: { $gt: 0 } },
    { $inc: { stock: -1 }, $set: { stockLimited: true } },
  );
  return { reserved: updated.modifiedCount === 1, available: updated.modifiedCount === 1 };
}

async function releaseOrderInventory(order) {
  if (!order?.inventoryReserved) return false;
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, inventoryReserved: true, inventoryReleased: { $ne: true } },
    { $set: { inventoryReleased: true } },
  );
  if (!claimed) return false;
  await Product.updateOne({ _id: order.serviceId }, { $inc: { stock: 1 } });
  return true;
}

module.exports = { reserveProduct, releaseOrderInventory };
