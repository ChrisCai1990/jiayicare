const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  _id: { type: String, required: true }, // 客户、服务来源、具体服务构成的确定性幂等键
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sourceType: { type: String, enum: ['order', 'follow_up', 'phase_assessment'], required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  entitlementId: { type: mongoose.Schema.Types.ObjectId, ref: 'PackageEntitlement', default: null },
  status: { type: String, enum: ['processing', 'completed', 'needs_review'], default: 'processing' },
  token: { type: String, default: '' },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  error: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('PackageEntitlementRedemption', schema);
