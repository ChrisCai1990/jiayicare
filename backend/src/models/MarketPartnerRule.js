const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketPartner', default: null, index: true },
  // The identifier may reference a ServicePackage for the 365 membership line.
  sourceType: { type: String, enum: ['product', 'servicePackage'], default: 'product' },
  productLine: { type: String, required: true, trim: true },
  category: { type: String, default: '', trim: true },
  version: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['draft', 'active', 'retired'], default: 'draft' },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  kind: { type: String, enum: ['annual', 'first', 'every'], required: true },
  firstBasisPoints: { type: Number, min: 0, max: 10000, default: 0 },
  tierBasisPoints: [{ type: Number, min: 0, max: 10000 }],
  renewalBasisPoints: [{ year: { type: Number, min: 2 }, basisPoints: { type: Number, min: 0, max: 10000 } }],
  directReferralRequired: { type: Boolean, default: false },
  quickCloseEnabled: { type: Boolean, default: false },
  quickCloseCapCents: { type: Number, min: 0, default: 100000 },
  retentionFloorBasisPoints: { type: Number, min: 0, max: 10000, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, productId: 1, version: 1 }, { unique: true });
schema.index({ tenantId: 1, productId: 1, status: 1, effectiveFrom: -1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('MarketPartnerRule', schema);
