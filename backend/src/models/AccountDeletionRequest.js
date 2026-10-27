const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  status: { type: String, enum: ['requested', 'processing', 'failed', 'completed'], default: 'requested' },
  policyVersion: { type: String, required: true },
  notice: { type: String, required: true },
  completionDays: { type: Number, required: true },
  requestedAt: { type: Date, required: true },
  receiptNonce: { type: String, default: '' },
  receiptExpiresAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  // Written only by the verified cleanup executor, never by the customer request route.
  completionEvidence: { type: String, default: '' },
}, { timestamps: true });
schema.index({ tenantId: 1, user: 1 }, { unique: true });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('AccountDeletionRequest', schema);
