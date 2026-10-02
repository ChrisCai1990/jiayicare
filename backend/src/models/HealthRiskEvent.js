const mongoose = require('mongoose');

const healthRiskEventSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  eventKey: { type: String, required: true, unique: true },
  sourceType: { type: String, enum: ['health_record', 'medical_report', 'monitoring_trend'], required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  ruleCode: { type: String, required: true },
  ruleVersion: { type: String, required: true },
  level: { type: String, enum: ['review', 'priority'], default: 'review' },
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
  sourceFingerprint: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'closed', 'superseded'], default: 'pending', index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  detectedAt: { type: Date, default: Date.now },
  dueAt: { type: Date, default: null },
  disposition: { type: String, enum: ['confirmed', 'needs_information', 'contacted', 'referred', 'false_positive', 'source_corrected', ''], default: '' },
  decisionNote: { type: String, default: '' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  decidedByName: { type: String, default: '' },
  decidedAt: { type: Date, default: null },
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

healthRiskEventSchema.index({ patientId: 1, status: 1, detectedAt: -1 });
healthRiskEventSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('HealthRiskEvent', healthRiskEventSchema);
