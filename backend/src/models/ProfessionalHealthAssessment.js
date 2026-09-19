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
  // 已提交反馈的内容指纹；每版独立，绝不改写已终审快照。
  sourceFeedbackKey: { type: String },
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
  followUpDrafts: { type: [mongoose.Schema.Types.Mixed], default: [] },
  followUpDraftGeneratedAt: { type: Date, default: null },
  followUpAutomation: {
    status: { type: String, enum: ['idle', 'queued', 'running', 'ready', 'failed', 'skipped'], default: 'idle' },
    message: { type: String, default: '' },
    token: { type: String, default: '' },
    startedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  followUpPublication: {
    status: { type: String, enum: ['pending', 'published', 'failed'], default: 'pending' },
    message: { type: String, default: '' },
    publishedAt: { type: Date, default: null },
  },
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
}, { timestamps: true, optimisticConcurrency: true });

professionalHealthAssessmentSchema.index({ patientId: 1, purpose: 1, domain: 1, status: 1 });
professionalHealthAssessmentSchema.index({ sourceReferralIds: 1 });
professionalHealthAssessmentSchema.index({ sourceFeedbackKey: 1 }, { unique: true, sparse: true });
professionalHealthAssessmentSchema.index({ 'followUpAutomation.status': 1, status: 1 });

// 入队与业务记录同次保存。后台异常不会令原业务请求失败，队列可在重启/每日恢复。
function wakeDraftWorker(row) {
  if (row?.status === 'advisor_review' && row.followUpAutomation?.status === 'queued') {
    require('../utils/assessmentFollowUpAutomation').wakeAssessmentDraftWorker();
  }
}
professionalHealthAssessmentSchema.post('save', wakeDraftWorker);
professionalHealthAssessmentSchema.post('findOneAndUpdate', wakeDraftWorker);

module.exports = mongoose.model('ProfessionalHealthAssessment', professionalHealthAssessmentSchema);
