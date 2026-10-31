const mongoose = require('mongoose');
const { Schema } = mongoose;

const member = new Schema({
  expertId: { type: Schema.Types.ObjectId, ref: 'MedicalExpert', required: true },
  staffId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  slotId: { type: Schema.Types.ObjectId, ref: 'StaffAvailability', required: true },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  opinion: { type: String, default: '' },
  nextStep: { type: String, default: '' },
  noBetterOption: { type: Boolean, default: false },
  repliedAt: { type: Date, default: null },
  revisions: { type: [Schema.Types.Mixed], default: [] },
}, { _id: false });

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['single', 'mdt'], required: true },
  specificationLabel: { type: String, default: '' },
  status: { type: String, enum: ['team_assignment', 'intake', 'advisor', 'planner', 'expert', 'reconcile', 'followup', 'final_review', 'completed', 'cancelled'], default: 'team_assignment', index: true },
  managerId: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  advisorId: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  plannerId: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  clientRequest: { type: String, default: '' },
  desiredExpertId: { type: Schema.Types.ObjectId, ref: 'MedicalExpert', default: null },
  materialSummary: { type: String, default: '' },
  materialReportIds: [{ type: Schema.Types.ObjectId, ref: 'MedicalReport' }],
  referralPurpose: { type: String, default: '' },
  referralQuestions: { type: String, default: '' },
  referralContext: { type: String, default: '' },
  referralPreparedAt: { type: Date, default: null },
  advisorSlotId: { type: Schema.Types.ObjectId, ref: 'StaffAvailability', default: null },
  managerSlotId: { type: Schema.Types.ObjectId, ref: 'StaffAvailability', default: null },
  members: { type: [member], default: [] },
  meetingUrl: { type: String, default: '' },
  reconciliation: { type: String, default: '' },
  reconciliationAt: { type: Date, default: null },
  followupPlan: { type: String, default: '' },
  selfManaged: { type: Boolean, default: false },
  followupReviewedAt: { type: Date, default: null },
  history: [{ action: String, actorId: Schema.Types.ObjectId, at: Date, note: String }],
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ tenantId: 1, orderId: 1 }, { unique: true });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('ExpertConsultationCase', schema);
