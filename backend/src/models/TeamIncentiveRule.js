const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  specificationLabel: { type: String, default: '' },
  role: { type: String, enum: ['familyDoctor', 'nutritionist', 'healthManager'], required: true },
  trigger: { type: String, required: true },
  ruleType: { type: String, enum: ['percentage', 'fixedAmount'], required: true },
  basisPoints: { type: Number, min: 0, max: 10000, default: 0 },
  amountCents: { type: Number, min: 0, default: 0 },
  capCents: { type: Number, min: 0, default: null },
  version: { type: Number, min: 1, required: true },
  status: { type: String, enum: ['draft', 'active', 'retired'], default: 'draft' },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });

schema.index({ tenantId: 1, productId: 1, specificationLabel: 1, role: 1, trigger: 1, version: 1 }, { unique: true });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('TeamIncentiveRule', schema);
