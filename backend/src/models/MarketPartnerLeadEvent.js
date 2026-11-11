const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketPartner', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  occurredAt: { type: Date, required: true, default: Date.now },
  directReferral: { type: Boolean, default: false },
  evidence: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['requested', 'approved', 'rejected'], default: 'requested' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, partnerId: 1, patientId: 1, productId: 1, occurredAt: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MarketPartnerLeadEvent', schema);
