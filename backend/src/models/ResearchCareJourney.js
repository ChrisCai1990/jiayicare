const mongoose = require('mongoose');

// Research is an administrative projection only. It never authorises AI, clinical review,
// plan publication, or follow-up execution.
const schema = new mongoose.Schema({
  studyCode: { type: String, required: true, default: 'wonca_2027', index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  researchNumber: { type: String, required: true },
  status: { type: String, enum: ['enrolled', 'withdrawn', 'locked'], default: 'enrolled', index: true },
  governanceBasis: { type: String, enum: ['ethics_approved', 'quality_improvement'], required: true },
  governanceReference: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
  authorizationReference: { type: String, required: true, trim: true, maxlength: 200, immutable: true },
  governanceVerifiedAt: { type: Date, required: true, immutable: true },
  authorizationVerifiedAt: { type: Date, required: true, immutable: true },
  inclusionNote: { type: String, default: '', maxlength: 1000 },
  excludedReason: { type: String, default: '', maxlength: 1000 },
  enrolledAt: { type: Date, default: Date.now },
  enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  withdrawnAt: { type: Date, default: null },
  withdrawnBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  lockedAt: { type: Date, default: null },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ studyCode: 1, patientId: 1 }, { unique: true });
schema.index({ studyCode: 1, researchNumber: 1 }, { unique: true });
module.exports = mongoose.model('ResearchCareJourney', schema);
