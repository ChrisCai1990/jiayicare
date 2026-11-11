const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketPartner', required: true },
  status: { type: String, enum: ['requested', 'approved', 'rejected'], default: 'requested' },
  terminatedAt: { type: Date, required: true },
  reason: { type: String, required: true, maxlength: 500 },
  evidence: { type: String, required: true, maxlength: 500 },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },
  reviewHistory: [{ reason: String, evidence: String, terminatedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    reviewedAt: Date, reviewNote: String }],
}, { timestamps: true });

schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MarketPartnerLoss', schema);
