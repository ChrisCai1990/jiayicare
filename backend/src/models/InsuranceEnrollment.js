const mongoose = require('mongoose');

const insuranceEnrollmentSchema = new mongoose.Schema({
  enterpriseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
  policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'EnterpriseInsurancePolicy', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  relation: { type: String, enum: ['employee', 'spouse', 'child', 'other'], default: 'employee' },
  planLevel: { type: String, default: '' },
  memberNumber: { type: String, default: '' },
  startAt: { type: Date, default: null },
  endAt: { type: Date, default: null },
  exclusions: { type: String, default: '' },
  specialTerms: { type: String, default: '' },
  status: { type: String, enum: ['active', 'pending', 'terminated'], default: 'active', index: true },
  note: { type: String, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

insuranceEnrollmentSchema.index({ policyId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('InsuranceEnrollment', insuranceEnrollmentSchema);
