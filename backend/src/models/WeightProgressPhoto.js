const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan', default: null },
  stage: { type: String, enum: ['before', 'progress', 'after'], required: true },
  view: { type: String, enum: ['front', 'side', 'back'], required: true },
  takenOn: { type: String, required: true },
  ossKey: { type: String, required: true },
  mimeType: { type: String, required: true },
  uploadedByType: { type: String, enum: ['staff', 'patient'], required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  consentConfirmedAt: { type: Date, required: true },
  deletedAt: { type: Date, default: null },
  deletedByType: { type: String, enum: ['staff', 'patient', ''], default: '' },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, patientId: 1, planId: 1, takenOn: -1 });
module.exports = mongoose.model('WeightProgressPhoto', schema);
