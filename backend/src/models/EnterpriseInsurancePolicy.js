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

const insuranceServiceManualSchema = new mongoose.Schema({
  internationalOutpatientBooking: { type: String, default: '' },
  appointmentRequiredInfo: { type: String, default: '' },
  providerNetworkCheck: { type: String, default: '' },
  directBillingEligibility: { type: String, default: '' },
  selfPayReimbursementEligibility: { type: String, default: '' },
  claimMaterials: { type: String, default: '' },
  claimProcess: { type: String, default: '' },
  claimDeadline: { type: String, default: '' },
  claimSubmissionChannels: { type: String, default: '' },
  claimFollowUp: { type: String, default: '' },
  emergencyProcedure: { type: String, default: '' },
  cancellationPolicy: { type: String, default: '' },
  escalationContact: { type: String, default: '' },
  sourceReference: { type: String, default: '' },
  verificationStatus: { type: String, enum: ['missing', 'review', 'verified'], default: 'missing' },
  verifiedAt: { type: Date, default: null },
  verifiedByName: { type: String, default: '' },
}, { _id: false });

const hospitalBookingRuleSchema = new mongoose.Schema({
  hospitalName: { type: String, required: true },
  campus: { type: String, default: '' },
  bookingRoute: {
    type: String,
    enum: ['insurer_vendor', 'platform_assisted', 'customer_self', 'confirm'],
    default: 'confirm',
  },
  vendorName: { type: String, default: '' },
  contact: { type: String, default: '' },
  bookingEntry: { type: String, default: '' },
  serviceHours: { type: String, default: '' },
  leadTime: { type: String, default: '' },
  requiredInfo: { type: String, default: '' },
  notes: { type: String, default: '' },
  verificationStatus: { type: String, enum: ['missing', 'review', 'verified'], default: 'missing' },
  verifiedAt: { type: Date, default: null },
  sourceReference: { type: String, default: '' },
}, { timestamps: false });

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
  serviceManual: { type: insuranceServiceManualSchema, default: () => ({}) },
  hospitalBookingRules: { type: [hospitalBookingRuleSchema], default: [] },
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
