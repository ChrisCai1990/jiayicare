const mongoose = require('mongoose');

const professionalHealthAssessmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  purpose: { type: String, enum: ['annual_input', 'issue_collaboration'], required: true },
  domain: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  collaborationMode: { type: String, enum: ['single_discipline', 'multidisciplinary'], default: 'single_discipline' },
  linkedDiseaseRecordId: { type: mongoose.Schema.Types.ObjectId, default: null },
  linkedDiseaseName: { type: String, default: '' },
  sourceReferralIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Referral' }],
  sourceRecordIds: [{ type: mongoose.Schema.Types.ObjectId }],
  sourceCutoffAt: { type: Date, default: null },
  facts: { type: [String], default: [] },
  risks: { type: [String], default: [] },
  missingInformation: { type: [String], default: [] },
  recommendations: {
    medicalVisit: { type: [mongoose.Schema.Types.Mixed], default: [] },
    examinations: { type: [mongoose.Schema.Types.Mixed], default: [] },
    followUps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    lifestyle: { type: [mongoose.Schema.Types.Mixed], default: [] },
    services: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  aiDraft: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, enum: ['draft', 'professional_review', 'advisor_review', 'approved', 'rejected', 'superseded'], default: 'draft', index: true },
  professionalReviewerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }],
  professionalReviewedAt: { type: Date, default: null },
  advisorReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  advisorReviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },
  validFrom: { type: Date, default: null },
  validUntil: { type: Date, default: null },
  supersedesAssessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfessionalHealthAssessment', default: null },
  supersededByAssessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfessionalHealthAssessment', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  createdByRole: { type: String, default: '' },
  auditLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

professionalHealthAssessmentSchema.index({ patientId: 1, purpose: 1, domain: 1, status: 1 });
professionalHealthAssessmentSchema.index({ sourceReferralIds: 1 });

module.exports = mongoose.model('ProfessionalHealthAssessment', professionalHealthAssessmentSchema);
