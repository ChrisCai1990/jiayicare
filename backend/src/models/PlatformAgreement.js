const mongoose = require('mongoose');

const approvalSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  name: String,
  at: Date,
  ip: String,
  userAgent: String,
  documentHash: String,
  pdfHash: String,
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  version: { type: Number, required: true },
  status: { type: String, enum: ['review', 'confirmed', 'effective'], default: 'review' },
  document: { type: String, required: true },
  documentHash: { type: String, required: true },
  prices: {
    platformMonthlyYuan: Number,
    aiServiceRatePercent: Number,
    setupYuan: Number,
  },
  platformApproval: approvalSchema,
  tenantApproval: approvalSchema,
  signedPdf: {
    path: String,
    hash: String,
    uploadedAt: Date,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  signedPdfTenantVerified: approvalSchema,
  effectiveAt: Date,
}, { timestamps: true });

schema.index({ tenantId: 1, version: 1 }, { unique: true });
module.exports = mongoose.model('PlatformAgreement', schema);
