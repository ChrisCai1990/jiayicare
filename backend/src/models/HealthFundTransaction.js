const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  enterpriseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enterprise', default: null, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
  type: { type: String, enum: ['grant', 'deduction', 'reversal', 'adjustment'], required: true },
  source: { type: String, enum: ['enterprise', 'promotion', 'other'], default: 'enterprise' },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'reversed'], default: 'active' },
  reversedTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthFundTransaction', default: null },
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  remark: { type: String, default: '' },
}, { timestamps: true });

schema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('HealthFundTransaction', schema);
