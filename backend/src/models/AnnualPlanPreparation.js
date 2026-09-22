const mongoose = require('mongoose');

const annualPlanPreparationSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year: { type: Number, required: true },
  requiredAssessmentDomains: { type: [String], default: [] },
  assessmentMode: { type: String, enum: ['required', 'none'], default: 'required' },
  assessmentNotRequiredReason: { type: String, default: '' },
  assessmentDecisionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  assessmentDecisionAt: { type: Date, default: null },
  medicationStatus: { type: String, enum: ['unknown', 'documented', 'none'], default: 'unknown' },
  supplementStatus: { type: String, enum: ['unknown', 'documented', 'none'], default: 'unknown' },
  waivers: {
    type: [{ key: String, reason: String, waivedAt: Date, waivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' } }],
    default: [],
  },
  advisorReadyConfirmedAt: { type: Date, default: null },
  advisorReadyConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

annualPlanPreparationSchema.index({ patientId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('AnnualPlanPreparation', annualPlanPreparationSchema);
