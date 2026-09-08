// Dry-run by default. Apply only after reviewing the diagnosis; backup precedes every mutation.
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { INVALID_ORDER_FILTER } = require('../utils/commissionLifecycle');
const screenshotOrders = [
  '6a9ea31717a2f40264dab3c9', '6a9ea17a17a2f40264da5031',
  '6a9e9f9917a2f40264d9a679', '6a9e9d9317a2f40264d8b7fd',
  '6a9e985f17a2f40264d6f555', '6a9e7d62d4161656914fa52b',
  '6a9cf24d9707d16a8f527254', '6a9ceec767c6164dcbb0ff2d',
].map(id => new mongoose.Types.ObjectId(id));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const orders = db.collection('orders');
  const commissions = db.collection('commissions');
  const invalid = await orders.find(INVALID_ORDER_FILTER, { projection: { _id: 1 } }).toArray();
  const affected = await commissions.find({ orderId: { $in: invalid.map(o => o._id) }, status: { $in: ['pending', 'confirmed', 'paid'] } }).toArray();
  const direct = [];
  for (const order of await orders.find({ _id: { $in: screenshotOrders }, referrerId: { $ne: null } }).toArray()) {
    // Guard against intervening manual corrections or an actual share/push conversion.
    if (order.pushRecordId || order.referralSource) continue;
    if (await db.collection('productshares').findOne({ convertedOrderId: order._id })) continue;
    direct.push(order);
  }
  const wrongReferral = await commissions.find({ orderId: { $in: direct.map(o => o._id) }, role: 'referrer', status: { $in: ['pending', 'confirmed', 'paid'] } }).toArray();
  console.log(JSON.stringify({ apply: process.argv.includes('--apply'), invalidCommissions: affected.length, screenshotDirectOrders: direct.length, wrongReferralCommissions: wrongReferral.length }));
  if (!process.argv.includes('--apply')) return;
  const backup = `commission-repair-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const unique = [...new Map([...affected, ...wrongReferral].map(c => [String(c._id), c])).values()];
  await db.collection('maintenance_backups').insertOne({ _id: backup, createdAt: new Date(), commissions: unique,
    orders: direct.map(o => ({ _id: o._id, referrerId: o.referrerId, referralSource: o.referralSource })) });
  const revoke = async (rows, reason) => {
    await commissions.updateMany({ _id: { $in: rows.map(c => c._id) }, status: { $in: ['pending', 'confirmed'] } },
      { $set: { status: 'cancelled', cancellationReason: reason, cancelledAt: new Date(), updatedAt: new Date() } });
    await commissions.updateMany({ _id: { $in: rows.map(c => c._id) }, status: 'paid' },
      { $set: { reversalRequired: true, cancellationReason: reason, updatedAt: new Date() } });
  };
  await revoke(affected, '订单已取消或全额退款，历史佣金同步取消');
  await revoke(wrongReferral, '客户直接下单，旧推送被错误认定为本次转介绍，佣金取消');
  for (const order of direct) await orders.updateOne({ _id: order._id, referrerId: order.referrerId, referralSource: { $in: [null, ''] } },
    { $set: { referrerId: null, referralSource: 'direct', updatedAt: new Date() } });
  console.log(JSON.stringify({ backup, remainingInvalidUnpaid: await commissions.countDocuments({ orderId: { $in: invalid.map(o => o._id) }, status: { $in: ['pending', 'confirmed'] } }) }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
