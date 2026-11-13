const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  relationId: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerTeamRelation', required: true },
  activity: { type: String, enum: ['promotion', 'service'], required: true },
  calculationType: { type: String, enum: ['percentage', 'fixedAmount'], required: true },
  basisPoints: { type: Number, min: 0, max: 10000, default: 0 },
  amountCents: { type: Number, min: 0, default: 0 },
  version: { type: Number, min: 1, required: true },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });

schema.index({ tenantId: 1, relationId: 1, activity: 1, version: 1 }, { unique: true });
schema.index({ tenantId: 1, relationId: 1, activity: 1, effectiveUntil: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('PartnerTeamRule', schema);
