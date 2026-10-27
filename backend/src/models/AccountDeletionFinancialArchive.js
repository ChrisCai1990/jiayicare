const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sourceType: { type: String, enum: ['Order', 'Payment', 'Refund'], required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  category: { type: String, enum: ['tax_supporting_record', 'accounting_voucher', 'accounting_ledger', 'accounting_auxiliary'], required: true },
  legalBasis: { type: String, required: true },
  retainUntil: { type: Date, required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  reviewedAt: { type: Date, required: true },
  keyId: { type: String, required: true },
  sourceHash: { type: String, required: true },
  payloadHash: { type: String, required: true },
  iv: { type: String, required: true, select: false },
  tag: { type: String, required: true, select: false },
  ciphertext: { type: String, required: true, select: false },
  verifiedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ tenantId: 1, requestId: 1, sourceType: 1, sourceId: 1 }, { unique: true });
// No TTL: statutory expiry is an appraisal date, not authority for automatic destruction.
schema.index({ tenantId: 1, retainUntil: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('AccountDeletionFinancialArchive', schema);
