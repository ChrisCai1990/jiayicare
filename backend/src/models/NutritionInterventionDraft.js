const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  // One current generation per nutrition plan. _id is the HealthPlan _id.
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan' },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanTemplate', required: true },
  sourceFingerprint: { type: String, required: true },
  sourceSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['generating', 'pending_review', 'publishing', 'published', 'failed'], required: true },
  generationToken: { type: String, default: '' },
  generationError: { type: String, default: '' },
  actions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  reviewDate: { type: String, required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  approvedAt: { type: Date, default: null },
  publishedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: 'revision' });

module.exports = mongoose.model('NutritionInterventionDraft', schema);
