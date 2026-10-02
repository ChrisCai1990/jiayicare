const mongoose = require('mongoose');

// The deterministic _id is the durable lock for one plan/template/period/domain.
// MongoDB always enforces _id uniqueness, including when autoIndex is disabled.
const schema = new mongoose.Schema({
  _id: { type: String },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  annualPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'AnnualPlan', required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanTemplate', required: true },
  periodKey: { type: String, required: true },
  status: { type: String, enum: ['generating', 'failed', 'completed'], required: true },
  token: { type: String, default: '' },
  startedAt: { type: Date, default: null },
  error: { type: String, default: '' },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhaseAssessment', default: null },
}, { timestamps: true });

module.exports = mongoose.model('PhaseAssessmentGeneration', schema);
