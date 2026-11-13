const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketPartner', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productLine: { type: String, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  source: { type: String, enum: ['link', 'code', 'manual'], required: true },
  referralCode: { type: String, default: '' },
  effectiveAt: { type: Date, required: true },
  expiresAt: { type: Date, default: null },
  status: { type: String, enum: ['candidate', 'approved', 'rejected'], default: 'candidate' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reason: { type: String, default: '' },
}, { timestamps: true });

schema.index({ tenantId: 1, patientId: 1, productLine: 1, effectiveAt: -1 });
schema.index({ tenantId: 1, orderId: 1, status: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('MarketPartnerAttribution', schema);
