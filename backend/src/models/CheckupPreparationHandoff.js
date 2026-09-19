const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan' },
  servicePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  annualPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'AnnualPlan', required: true },
  plannerTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUp', required: true },
  linkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  status: { type: String, enum: ['linked_pending_activation'], default: 'linked_pending_activation' },
  evidence: { type: mongoose.Schema.Types.Mixed, required: true },
  serviceTitle: String,
  serviceUpdatedAt: Date,
}, { timestamps: true, autoCreate: false, autoIndex: false });
// Explicit rollout prerequisite. Runtime only inspects, never builds this index.
schema.index({ servicePlanId: 1 }, { unique: true });
module.exports = mongoose.model('CheckupPreparationHandoff', schema);
