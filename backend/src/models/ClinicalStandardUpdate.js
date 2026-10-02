const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  standardId: { type: String, required: true, index: true },
  fingerprint: { type: String, required: true },
  sourceUrl: { type: String, default: '' },
  trigger: { type: String, enum: ['baseline_review', 'source_changed', 'scheduled_review'], default: 'source_changed' },
  detectedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'clinically_reviewed', 'dismissed'], default: 'pending', index: true },
  note: { type: String, default: '', maxlength: 2000 },
  sourceVerified: { type: Boolean, default: false },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedByName: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ standardId: 1, fingerprint: 1 }, { unique: true });
module.exports = mongoose.model('ClinicalStandardUpdate', schema);
