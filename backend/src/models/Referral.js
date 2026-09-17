const mongoose = require('mongoose');
const { Schema } = mongoose;

const referralSchema = new Schema({
  fromStaffId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  toStaffId:   { type: Schema.Types.ObjectId, ref: 'Admin', default: null }, // 外部专家不登录系统时可为空
  patientId:   { type: Schema.Types.ObjectId, ref: 'User',  required: true },
  reason:      { type: String, required: true },  // 转介原因（简述）
  content:     { type: String, default: '' },     // 详细说明
  urgency:     { type: String, enum: ['normal', 'urgent'], default: 'normal' },
  status:      { type: String, enum: ['pending', 'accepted', 'completed', 'rejected'], default: 'pending' },
  response:         { type: String, default: '' },     // 接收方回复（旧字段，保留兼容）
  responseAnalysis: { type: String, default: '' },     // 当前问题分析
  responseOpinion:  { type: String, default: '' },     // 会诊意见
  respondedAt:      { type: Date, default: null },
  fromStaffUnread:  { type: Boolean, default: false }, // B回复后置true，A查看后清除
  attachedHealthInfo: { type: mongoose.Schema.Types.Mixed, default: null }, // A附带的健康档案摘要
  linkedDiseaseRecordId: { type: Schema.Types.ObjectId, default: null },
  linkedDiseaseName: { type: String, default: '' },
  linkedDiseaseSnapshot: { type: Schema.Types.Mixed, default: null }, // 发起时冻结；接收方只能看发起方授权的信息
  referralPurpose: { type: String, default: '' },
  questionList: { type: String, default: '' },
  requiresConclusion: { type: Boolean, default: true },
  referralType: { type: String, enum: ['internal_collaboration', 'external_medical'], default: 'internal_collaboration' },
  medicalExpertId: { type: Schema.Types.ObjectId, ref: 'MedicalExpert', default: null },
  medicalExpertSnapshot: { type: Schema.Types.Mixed, default: null }, // 冻结医院/科室/职称/擅长，保证历史可追溯
  consultation: {
    feedbackType: { type: String, enum: ['internal_collaboration', 'external_medical_record'], default: 'internal_collaboration' },
    sourceInstitution: { type: String, default: '' },
    sourceDepartment: { type: String, default: '' },
    sourceDoctor: { type: String, default: '' },
    sourceDate: { type: Date, default: null },
    verificationStatus: { type: String, enum: ['self_reported', 'pending_verification', 'source_verified'], default: 'pending_verification' },
    diagnosis: { type: String, default: '' },
    diagnosisChanged: { type: Boolean, default: false },
    examinationAdvice: { type: String, default: '' },
    treatmentAdvice: { type: String, default: '' },
    medicationAdvice: { type: String, default: '' },
    riskWarning: { type: String, default: '' },
    nextPlan: { type: String, default: '' },
    noMedicalConclusion: { type: Boolean, default: false },
  },
  courseDraft: { type: Schema.Types.Mixed, default: null },
  courseDraftStatus: { type: String, enum: ['none', 'pending_review', 'approved', 'rejected'], default: 'none' },
  linkedCourseEntryId: { type: Schema.Types.ObjectId, default: null },
  revisionHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

referralSchema.index({ toStaffId: 1, status: 1 });
referralSchema.index({ fromStaffId: 1 });
referralSchema.index({ patientId: 1 });

module.exports = mongoose.model('Referral', referralSchema);
