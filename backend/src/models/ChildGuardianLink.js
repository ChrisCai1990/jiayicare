const mongoose = require('mongoose');

const childGuardianLinkSchema = new mongoose.Schema({
  child: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  guardian: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  relation: { type: String, enum: ['父亲', '母亲', '其他监护人'], required: true },
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  consentAt: { type: Date, required: true },
  consentTextVersion: { type: String, default: 'child-guardian-20261003' },
  createdByGuardian: { type: Boolean, default: false },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  verificationNote: { type: String, default: '' },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

childGuardianLinkSchema.index({ child: 1, guardian: 1 }, { unique: true });

module.exports = mongoose.model('ChildGuardianLink', childGuardianLinkSchema);
