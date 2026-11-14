const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  subjectType: { type: String, enum: ['staff', 'marketPartner', 'professionalTeam'], required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  signedDate: { type: String, required: true },
  effectiveAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  name: { type: String, required: true },
  key: { type: String, required: true, select: false },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  sha256: { type: String, required: true, select: false },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  archivedAt: { type: Date, default: Date.now },
}, { timestamps: true });

schema.index({ tenantId: 1, subjectType: 1, subjectId: 1, archivedAt: -1 });
schema.index({ tenantId: 1, subjectType: 1, subjectId: 1, sha256: 1 }, { unique: true });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('CooperationAgreement', schema);
