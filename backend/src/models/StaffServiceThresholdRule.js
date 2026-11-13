const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  thresholdCents: { type: Number, min: 0, required: true },
  version: { type: Number, min: 1, required: true },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });

schema.index({ tenantId: 1, staffId: 1, version: 1 }, { unique: true });
schema.index({ tenantId: 1, staffId: 1, effectiveUntil: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('StaffServiceThresholdRule', schema);
