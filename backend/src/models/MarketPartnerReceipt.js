const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  amountCents: { type: Number, required: true, min: 1 },
  reference: { type: String, required: true, trim: true, maxlength: 120 },
  receivedAt: { type: Date, required: true },
  evidence: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ['submitted', 'approved', 'rejected'], default: 'submitted' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },
  reviewHistory: [{ status: String, reference: String, amountCents: Number,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    reviewedAt: Date, reviewNote: String }],
}, { timestamps: true });

schema.index({ tenantId: 1, reference: 1 }, { unique: true });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MarketPartnerReceipt', schema);
