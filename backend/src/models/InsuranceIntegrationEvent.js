const mongoose = require('mongoose');

const insuranceIntegrationEventSchema = new mongoose.Schema({
  provider: { type: String, required: true, index: true },
  eventId: { type: String, required: true },
  eventType: { type: String, required: true, index: true },
  externalCaseId: { type: String, default: '', index: true },
  status: { type: String, enum: ['received', 'processed', 'ignored', 'failed'], default: 'received', index: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  error: { type: String, default: '' },
  processedAt: { type: Date, default: null },
}, { timestamps: true });

insuranceIntegrationEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
module.exports = mongoose.model('InsuranceIntegrationEvent', insuranceIntegrationEventSchema);
