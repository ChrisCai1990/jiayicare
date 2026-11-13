const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productLine: { type: String, required: true },
  cutoverAt: { type: Date, required: true },
  priorPaidPeriods: { type: Number, required: true, min: 0 },
  evidence: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['requested', 'approved', 'rejected'], default: 'requested' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },
  reviewHistory: [{ priorPaidPeriods: Number, evidence: String, reviewedBy: mongoose.Schema.Types.ObjectId,
    reviewedAt: Date, reviewNote: String }],
}, { timestamps: true });

schema.index({ tenantId: 1, patientId: 1, productLine: 1 }, { unique: true });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MarketPartnerCustomerHistory', schema);
