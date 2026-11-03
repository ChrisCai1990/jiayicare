const mongoose = require('mongoose');
const { Schema } = mongoose;

const member = new Schema({
  expertId: { type: Schema.Types.ObjectId, ref: 'MedicalExpert', required: true },
  staffId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  slotId: { type: Schema.Types.ObjectId, ref: 'StaffAvailability', required: true },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  changeRequests: [{ reason: String, actorId: Schema.Types.ObjectId, at: Date, resolvedAt: Date }],
  reviewMode: { type: String, enum: ['needed', 'not_needed', 'to_confirm', ''], default: '' },
  reviewNote: { type: String, default: '' },
  reviewRecommendations: [{ time: String, items: String }],
  opinion: { type: String, default: '' },
  nextStep: { type: String, default: '' },
  noBetterOption: { type: Boolean, default: false },
  viewedAt: { type: Date, default: null },
  viewedReferralId: { type: Schema.Types.ObjectId, default: null },
  viewedVersion: { type: Number, default: null },
  dispatchedAt: { type: Date, default: null },
  repliedAt: { type: Date, default: null },
  revisions: { type: [Schema.Types.Mixed], default: [] },
}, { _id: false });

const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  initiationSource: { type: String, enum: ['customer_order', 'staff'], default: 'customer_order' },
  initiatedByStaff: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
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
  referralId: { type: Schema.Types.ObjectId, ref: 'Referral', default: null, index: true },
  // Historical cases retain these fields; new cases use the linked Referral.
  referralPurpose: { type: String, default: '' },
  referralQuestions: { type: String, default: '' },
  referralContext: { type: String, default: '' },
  referralPreparedAt: { type: Date, default: null },
  confirmedExpertIds: [{ type: Schema.Types.ObjectId, ref: 'MedicalExpert' }],
  plannedExpertIds: [{ type: Schema.Types.ObjectId, ref: 'MedicalExpert' }],
  expertsConfirmedAt: { type: Date, default: null },
  expertChangeReason: { type: String, default: '' },
  advisorSlotId: { type: Schema.Types.ObjectId, ref: 'StaffAvailability', default: null },
  managerSlotId: { type: Schema.Types.ObjectId, ref: 'StaffAvailability', default: null },
  members: { type: [member], default: [] },
  correspondence: [{
    expertStaffId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    expertName: String, question: String, requestedAt: Date,
    answers: [{ actorId: Schema.Types.ObjectId, actorName: String, content: String, at: Date, referralVersion: Number }],
  }],
  meetingUrl: { type: String, default: '' },
  reconciliation: { type: String, default: '' },
  reconciliationAt: { type: Date, default: null },
  followupDraft: { type: Schema.Types.Mixed, default: null },
  followupItems: [{ date: Date, items: String, sourceText: String, followupId: { type: Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() } }],
  followupPlan: { type: String, default: '' },
  selfManaged: { type: Boolean, default: false },
  followupReviewedAt: { type: Date, default: null },
  history: [{ action: String, actorId: Schema.Types.ObjectId, at: Date, note: String }],
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ tenantId: 1, orderId: 1 }, { name: 'tenant_order_unique_objectId', unique: true,
  partialFilterExpression: { orderId: { $type: 'objectId' } } });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('ExpertConsultationCase', schema);
