const mongoose = require('mongoose');

const caseStepSchema = new mongoose.Schema({
  title: { type: String, required: true },
  status: { type: String, enum: ['pending', 'completed', 'skipped'], default: 'pending' },
  completedAt: { type: Date, default: null },
  completedByName: { type: String, default: '' },
  note: { type: String, default: '' },
}, { timestamps: false });

const insuranceServiceCaseSchema = new mongoose.Schema({
  enterpriseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enterprise', required: true, index: true },
  policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'EnterpriseInsurancePolicy', required: true, index: true },
  enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceEnrollment', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  scenario: { type: String, required: true },
  title: { type: String, required: true },
  status: { type: String, enum: ['registered', 'verifying', 'materials', 'submitted', 'reviewing', 'supplement', 'paid', 'partially_paid', 'denied', 'closed'], default: 'registered', index: true },
  occurredAt: { type: Date, default: null },
  dueAt: { type: Date, default: null },
  estimatedAmount: { type: Number, default: 0 },
  claimedAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  insurerReference: { type: String, default: '' },
  note: { type: String, default: '' },
  steps: { type: [caseStepSchema], default: [] },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

module.exports = mongoose.model('InsuranceServiceCase', insuranceServiceCaseSchema);
