const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['invited', 'submitted', 'approved', 'rejected', 'revoked'], default: 'invited', index: true },
  partnerName: { type: String, default: '' },
  specialtyTeam: { type: String, default: '' },
  candidateName: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  submittedAt: { type: Date, default: null },
  response: {
    name: String, phone: String, institutionName: String, departmentName: String,
    title: String, profession: String, registrationScope: String, experienceYears: Number,
    expertise: [String], unsuitableTopics: String,
    singleConsultation: Boolean, mdt: Boolean, mdtLead: Boolean,
    singleExpectedFee: Number, mdtExpectedFee: Number, feeTaxBasis: String,
    feeIncludes: [String], extraFeeRule: String,
    preparationMinutes: Number, materialLimit: String, replyHours: Number,
    weeklyAvailability: String, weeklyCapacity: Number, minimumNoticeHours: Number,
    scheduleMaintenance: String, recordingPreference: String,
    cooperationNotes: String, privacyAcknowledged: Boolean,
  },
  screening: {
    qualificationVerified: { type: Boolean, default: false },
    professional: { type: String, enum: ['', 'pass', 'pending', 'fail'], default: '' },
    communication: { type: String, enum: ['', 'pass', 'pending', 'fail'], default: '' },
    ethics: { type: String, enum: ['', 'pass', 'pending', 'fail'], default: '' },
    evidence: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewedAt: { type: Date, default: null },
  },
  agreement: {
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalInstitution', default: null },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalDepartment', default: null },
    singleFee: { type: Number, default: null },
    mdtFee: { type: Number, default: null },
    note: { type: String, default: '' },
  },
  expertProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalExpert', default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, status: 1, createdAt: -1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('ExpertRecruitment', schema);
