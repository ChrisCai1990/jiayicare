const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  action: { type: String, required: true },
  note: { type: String, default: '' },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  actorName: { type: String, required: true },
  at: { type: Date, default: Date.now },
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  source: { type: String, enum: ['followup', 'nutrition_plan'], required: true },
  sourcePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan', default: null },
  assessmentType: { type: String, enum: ['initial', 'reassessment'], required: true },
  reason: { type: String, required: true, maxlength: 2000 },
  focus: { type: String, default: '', maxlength: 2000 },
  advisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  nutritionistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  status: { type: String, enum: ['awaiting_booking', 'booked', 'completed', 'cancelled'], default: 'awaiting_booking', index: true },
  appointment: {
    at: Date,
    mode: { type: String, enum: ['online', 'offline', ''], default: '' },
    meetingRoom: { type: String, default: '' },
    store: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  assessment: {
    summary: { type: String, default: '' },
    recommendations: { type: String, default: '' },
    completedAt: Date,
  },
  events: { type: [eventSchema], default: [] },
}, { timestamps: true });

schema.index({ tenantId: 1, patientId: 1, createdAt: -1 });
schema.index({ tenantId: 1, patientId: 1, source: 1, sourcePlanId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['awaiting_booking', 'booked'] } } });
schema.plugin(require('../utils/patientTenantFence').patientTenantFence);
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('NutritionAssessmentRequest', schema);
