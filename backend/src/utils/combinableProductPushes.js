const Order = require('../models/Order');
const PushRecord = require('../models/PushRecord');
const { cents } = require('./checkoutAmounts');

function singleItem(record) {
  const products = record.products?.length ? record.products : record.productId ? [{
    productId: record.productId, name: record.title, price: record.price,
    specificationLabel: '',
  }] : [];
  return products.length === 1 ? products[0] : null;
}

async function samePushes(anchor, patientId) {
  const item = singleItem(anchor);
  if (!item?.productId || !Number.isFinite(Number(item.price))) return [];
  // A recommendation remains selectable for 30 days. Older recommendations
  // are still visible in the inbox, but cannot silently enlarge a new cart.
  const since = new Date(Math.max(Date.now() - 30 * 86400000, new Date(anchor.createdAt || 0).getTime()));
  const candidates = await PushRecord.find({ patientId, tenantId: anchor.tenantId || null,
    type: 'product', createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(100).lean();
  return candidates.filter(record => {
    const candidate = singleItem(record);
    return candidate && String(candidate.productId) === String(item.productId)
      && String(candidate.specificationLabel || '') === String(item.specificationLabel || '')
      && cents(candidate.price) === cents(item.price);
  });
}

async function availableSamePushes(anchor, patientId) {
  const matching = (await samePushes(anchor, patientId)).filter(record => !record.withdrawnAt);
  if (!matching.length) return [];
  const active = await Order.find({ user: patientId, pushRecordId: { $in: matching.map(row => row._id) },
    status: { $ne: 'cancelled' }, tradeStatus: { $nin: ['closed', 'refunded'] } }).select('pushRecordId').lean();
  const used = new Set(active.map(order => String(order.pushRecordId)));
  return matching.filter(record => !used.has(String(record._id))).slice(0, 10);
}

module.exports = { singleItem, samePushes, availableSamePushes };
