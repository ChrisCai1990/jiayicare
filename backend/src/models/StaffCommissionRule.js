const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  category: { type: String, required: true, trim: true },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
  version: { type: Number, required: true, min: 1 },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  referrerRate: { type: Number, min: 0, max: 100, required: true },
  fulfillerRate: { type: Number, min: 0, max: 100, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });

schema.index({ tenantId: 1, staffId: 1, category: 1, version: 1 }, { unique: true });
schema.index({ tenantId: 1, staffId: 1, productIds: 1, effectiveFrom: -1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('StaffCommissionRule', schema);
