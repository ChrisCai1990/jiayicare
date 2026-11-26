const Order = require('../models/Order');
const { orderPushFilter } = require('./combinableProductPushes');

// A live order takes precedence over a previous refunded attempt on the same push.
const priority = ['refunded', 'pending', 'paid', 'partialRefund', 'refunding'];

function orderState(order) {
  if ([order.tradeStatus, order.paymentStatus, order.refundStatus].includes('refunded')) return 'refunded';
  if (order.status === 'cancelled' || order.tradeStatus === 'closed') return null;
  if (order.tradeStatus === 'refund_pending' || ['processing', 'requested'].includes(order.refundStatus)) return 'refunding';
  if ([order.tradeStatus, order.refundStatus].includes('partially_refunded')) return 'partialRefund';
  if (order.paymentStatus === 'paid' || order.paidAt) return 'paid';
  return 'pending';
}

async function attachProductOrderStates(records) {
  const products = new Map(records.filter(row => row.type === 'product').map(row => [String(row._id), row]));
  if (!products.size) return records;
  const orders = await Order.find({
    user: { $in: [...products.values()].map(row => row.patientId?._id || row.patientId).filter(Boolean) },
    ...orderPushFilter([...products.keys()]),
  }).select('user pushRecordId pushRecordIds tradeStatus paymentStatus refundStatus status paidAt').lean();
  for (const order of orders) {
    const state = orderState(order);
    if (!state) continue;
    for (const id of [order.pushRecordId, ...(order.pushRecordIds || [])]) {
      const row = products.get(String(id));
      if (row && String(row.patientId?._id || row.patientId) === String(order.user) &&
          priority.indexOf(state) > priority.indexOf(row.orderState)) row.orderState = state;
    }
  }
  return records;
}

module.exports = { attachProductOrderStates };
