const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  standardId: { type: String, required: true, unique: true },
  fingerprint: { type: String, default: '' },
  checkedAt: { type: Date, default: null },
  nextCheckAt: { type: Date, default: null },
  leaseUntil: { type: Date, default: null },
  lastError: { type: String, default: '' },
  sourceFinalUrl: { type: String, default: '' },
  annualReviewYear: { type: Number, default: 0 },
}, { timestamps: true });
module.exports = mongoose.model('ClinicalStandardWatch', schema);
