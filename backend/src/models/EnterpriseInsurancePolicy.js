const mongoose = require('mongoose');

const insuranceRuleSchema = new mongoose.Schema({
  scene: { type: String, required: true },
  covered: { type: String, enum: ['yes', 'no', 'confirm'], default: 'confirm' },
  directBilling: { type: String, enum: ['yes', 'no', 'confirm'], default: 'confirm' },
  preAuthorization: { type: String, enum: ['required', 'not_required', 'confirm'], default: 'confirm' },
  deductible: { type: String, default: '' },
  reimbursementRate: { type: String, default: '' },
  limit: { type: String, default: '' },
  hospitalRestrictions: { type: String, default: '' },
  claimDeadline: { type: String, default: '' },
  requiredMaterials: { type: String, default: '' },
  notes: { type: String, default: '' },
  sourceReference: { type: String, default: '' },
}, { _id: true });

const enterpriseInsurancePolicySchema = new mongoose.Schema({
  enterpriseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
  year: { type: Number, required: true, index: true },
  name: { type: String, required: true },
  insurerName: { type: String, default: '' },
  administratorName: { type: String, default: '' },
  policyNumber: { type: String, default: '' },
  startAt: { type: Date, default: null },
  endAt: { type: Date, default: null },
  servicePhone: { type: String, default: '' },
  claimContact: { type: String, default: '' },
  directBillingMethod: { type: String, default: '' },
  preAuthorizationMethod: { type: String, default: '' },
  claimSubmissionMethod: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'review', 'active', 'expired'], default: 'draft', index: true },
  rules: { type: [insuranceRuleSchema], default: [] },
  attachments: { type: [new mongoose.Schema({ name: String, url: String, category: String }, { _id: false })], default: [] },
  version: { type: Number, default: 1 },
  lastVerifiedAt: { type: Date, default: null },
  lastVerifiedByName: { type: String, default: '' },
  note: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

enterpriseInsurancePolicySchema.index({ enterpriseId: 1, year: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('EnterpriseInsurancePolicy', enterpriseInsurancePolicySchema);
