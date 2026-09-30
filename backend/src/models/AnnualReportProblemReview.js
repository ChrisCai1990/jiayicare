const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year: { type: Number, required: true },
  status: { type: String, enum: ['empty', 'generating', 'ready', 'approved', 'failed'], default: 'empty' },
  sourceFingerprint: String,
  sourceReportIds: [mongoose.Schema.Types.ObjectId],
  topics: { type: [mongoose.Schema.Types.Mixed], default: [] },
  coverage: { type: [mongoose.Schema.Types.Mixed], default: [] },
  summaryReference: mongoose.Schema.Types.Mixed,
  priorAdvice: { type: [mongoose.Schema.Types.Mixed], default: [] },
  generationToken: String,
  startedAt: Date,
  message: String,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  reviewedAt: Date,
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ patientId: 1, year: 1 }, { unique: true });
module.exports = mongoose.model('AnnualReportProblemReview', schema);
