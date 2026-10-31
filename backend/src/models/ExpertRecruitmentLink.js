const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  token: { type: String, required: true, unique: true, select: false },
  tokenHash: { type: String, required: true, unique: true, select: false },
  partnerName: { type: String, required: true },
  specialtyTeam: { type: String, required: true },
  status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, createdAt: -1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('ExpertRecruitmentLink', schema);
