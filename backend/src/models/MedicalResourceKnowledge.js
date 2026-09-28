const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  action: { type: String, enum: ['created', 'revised', 'submitted', 'published', 'returned', 'updated', 'expired', 'archived'], required: true },
  note: { type: String, default: '' },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  version: { type: Number, default: 1 },
}, { timestamps: { createdAt: 'at', updatedAt: false }, _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  kind: { type: String, enum: ['department_advantage', 'expert_recommendation', 'appointment_rule', 'visit_guidance', 'service_case'], required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalInstitution', default: null, index: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalDepartment', default: null, index: true },
  expertId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalExpert', default: null, index: true },
  tags: { type: [String], default: [] },
  applicableScenarios: { type: [String], default: [] },
  summary: { type: String, default: '', maxlength: 600 },
  recommendationBasis: { type: String, default: '', maxlength: 4000 },
  appointmentInfo: {
    channels: { type: [String], default: [] },
    advanceDays: { type: String, default: '', maxlength: 100 },
    materials: { type: [String], default: [] },
    feeAndInsurance: { type: String, default: '', maxlength: 1000 },
  },
  precautions: { type: String, default: '', maxlength: 4000 },
  serviceBoundary: { type: String, default: '', maxlength: 2000 },
  riskNotice: { type: String, default: '', maxlength: 2000 },
  sourceNote: { type: String, default: '', maxlength: 1000 },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
  supersedesId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalResourceKnowledge', default: null, index: true },
  status: { type: String, enum: ['draft', 'pending_review', 'published', 'returned', 'expired', 'archived'], default: 'draft', index: true },
  version: { type: Number, default: 1, min: 1 },
  submittedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewNote: { type: String, default: '', maxlength: 1000 },
  publishedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null, index: true },
  auditLog: { type: [auditSchema], default: [] },
}, { timestamps: true });

schema.index({ tenantId: 1, kind: 1, status: 1, updatedAt: -1 });
schema.index({ tenantId: 1, institutionId: 1, departmentId: 1, expertId: 1, status: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('MedicalResourceKnowledge', schema);
