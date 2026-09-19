const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  channel: { type: String, enum: ['wechat_pay', 'health_fund', 'offline'], required: true },
  status: { type: String, enum: ['created', 'processing', 'succeeded', 'failed', 'closed'], default: 'created', index: true },
  amount: { type: Number, required: true, min: 0 },
  // One WeChat merchant payment, several independently fulfilled/refunded orders.
  // Empty for historical/single-product payments.
  allocations: [{ _id: false, order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true }, amount: { type: Number, required: true, min: 0 } }],
  settlementLockUntil: { type: Date, default: null },
  settlementLockToken: { type: String, default: '' },
  currency: { type: String, default: 'CNY' },
  outTradeNo: { type: String, required: true, unique: true, index: true },
  prepayId: { type: String, default: '' },
  transactionId: { type: String, default: '', index: true },
  failureCode: { type: String, default: '' },
  failureMessage: { type: String, default: '' },
  paidAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  lastQueriedAt: { type: Date, default: null },
  notifySnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

paymentSchema.index({ 'allocations.order': 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
