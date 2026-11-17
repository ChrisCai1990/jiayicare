const Order = require('../models/Order');

async function paidOrderCounts(products) {
  if (!products.length) return new Map();
  const rows = await Order.aggregate([
    { $match: { serviceId: { $in: products.map(product => String(product._id)) }, paymentStatus: 'paid',
      $or: [{ paidAmount: { $gt: 0 } }, { healthFundAmount: { $gt: 0 } }, { enterpriseSharedFundAmount: { $gt: 0 } }] } },
    { $group: { _id: '$serviceId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map(row => [String(row._id), row.count]));
}

function displayedPaidOrderCount(product, paidCounts) {
  return Math.max(0, Number(product.historicalPaidOrders) || 0) + (paidCounts.get(String(product._id)) || 0);
}

module.exports = { paidOrderCounts, displayedPaidOrderCount };
