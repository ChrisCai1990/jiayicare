const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  // 纯健康基金订单没有微信支付流水，也必须能创建退款申请并原路退回基金。
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  outRefundNo: { type: String, required: true, unique: true, index: true },
  refundId: { type: String, default: '', index: true },
  amount: { type: Number, required: true, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['requested', 'processing', 'succeeded', 'failed', 'closed'], default: 'requested', index: true },
  failureCode: { type: String, default: '' },
  failureMessage: { type: String, default: '' },
  succeededAt: { type: Date, default: null },
  notifySnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Refund', refundSchema);
