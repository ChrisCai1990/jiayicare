const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  leaderType: { type: String, enum: ['staff', 'partner'], required: true },
  leaderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, leaderType: 1, leaderId: 1 },
  { unique: true, partialFilterExpression: { effectiveUntil: null } });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('PartnerTeam', schema);
