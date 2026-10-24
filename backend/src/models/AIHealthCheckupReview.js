const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year: { type: Number, required: true },
  sourceKey: { type: String, required: true },
  sourceVersion: { type: String, required: true },
  itemKey: { type: String, required: true },
  itemText: { type: String, required: true },
  disposition: { type: String, enum: ['needs_exam', 'request_records', 'not_needed', 'already_managed'], required: true },
  title: { type: String, default: '' },
  note: { type: String, default: '' },
  linkedDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AnnualManagementDecision', default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  reviewedAt: { type: Date, required: true },
}, { timestamps: true });

schema.index({ patientId: 1, year: 1, sourceKey: 1 }, { unique: true });
module.exports = mongoose.model('AIHealthCheckupReview', schema);
