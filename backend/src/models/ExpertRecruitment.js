const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['invited', 'submitted', 'approved', 'rejected', 'revoked'], default: 'invited', index: true },
  partnerName: { type: String, default: '' },
  specialtyTeam: { type: String, default: '' },
  candidateName: { type: String, default: '' },
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpertRecruitmentLink', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  submittedAt: { type: Date, default: null },
  supplementTokenHash: { type: String, select: false, index: true },
  supplementExpiresAt: Date,
  certificates: [{
    category: String, name: String, key: { type: String, select: false }, mimeType: String, size: Number,
    uploadedAt: Date, uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewStatus: { type: String, enum: ['pending', 'pass', 'fail'], default: 'pending' },
    reviewNote: String, reviewedAt: Date, reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  }],
  signedAgreements: [{
    name: String, key: { type: String, select: false }, mimeType: String, size: Number, sha256: String,
    signedDate: String, agreementNo: String, archivedAt: Date,
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  }],
  supplementUpdatedAt: Date,
  response: {
    name: String, phone: String, contactPhone: String, institutionName: String, departmentName: String,
    title: String, profession: String, education: String, registrationScope: String, experienceYears: Number,
    expertise: [String], unsuitableTopics: String,
    languages: [{ language: String, level: String, _id: false }],
    singleConsultation: Boolean, mdt: Boolean, mdtLead: Boolean,
    singleExpectedFee: Number, mdtExpectedFee: Number, feeTaxBasis: String,
    feeIncludes: [String], extraFeeRule: String,
    preparationMinutes: Number, materialLimit: String, replyHours: Number,
    weeklyAvailability: String, weeklyCapacity: Number, minimumNoticeHours: Number,
    scheduleMaintenance: String, recordingPreference: String,
    cooperationNotes: String, privacyAcknowledged: Boolean,
  },
  contactPhoneChanges: [{ before: String, after: String, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, updatedByName: String, updatedAt: Date }],
  availabilityChanges: [{ before: String, after: String, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, updatedByName: String, updatedAt: Date }],
  educationChanges: [{
    before: String, after: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    updatedAt: Date,
  }],
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
    profileKind: { type: String, enum: ['medical','professional'], default: 'medical' },
    organizationName: String, specialty: String,
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
