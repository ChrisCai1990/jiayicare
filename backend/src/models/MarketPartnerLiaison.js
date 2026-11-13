const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketPartner', required: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  endReason: { type: String, default: '' },
}, { timestamps: true });

schema.index({ tenantId: 1, partnerId: 1 },
  { unique: true, partialFilterExpression: { effectiveUntil: null } });
schema.index({ tenantId: 1, staffId: 1, effectiveUntil: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MarketPartnerLiaison', schema);
