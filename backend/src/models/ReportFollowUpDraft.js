const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', required: true },
  sourceKey: { type: String, required: true, unique: true },
  sourceSequence: { type: Number, required: true },
  sourceSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  title: String,
  purpose: { type: String, default: 'issue_collaboration' },
  status: { type: String, enum: ['advisor_review', 'approved', 'rejected', 'superseded', 'excluded', 'no_action'], default: 'advisor_review' },
  followUpDrafts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  followUpDraftGeneratedAt: Date,
  followUpAutomation: { type: mongoose.Schema.Types.Mixed, default: () => ({ status: 'queued', attempts: 0 }) },
  followUpPublication: { type: mongoose.Schema.Types.Mixed, default: () => ({ status: 'pending' }) },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  advisorReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  advisorReviewedAt: Date,
  auditLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ 'followUpAutomation.status': 1, status: 1 });
schema.index({ reportId: 1, sourceSequence: -1 });
module.exports = mongoose.model('ReportFollowUpDraft', schema);
