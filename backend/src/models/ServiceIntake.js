const mongoose = require('mongoose');

// A confirmed service request survives the public lead's 180-day retention period.
// It links existing business records; it never creates payment or clinical tasks.
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sourceLeadId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  source: { type: String, required: true, immutable: true },
  sourceConsentAt: { type: Date, required: true, immutable: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  customerConfirmedAt: { type: Date, required: true, immutable: true },
  need: { type: String, required: true, maxlength: 1000 },
  serviceDirection: { type: String, enum: ['medical_assistance', 'metabolic_84', 'long_term'], required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan', default: null },
  nextContactAt: { type: Date, required: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  closureReason: { type: String, default: '', maxlength: 1000 },
  revision: { type: Number, default: 0 },
  events: [{ _id: false, at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, action: String, note: String,
    orderId: mongoose.Schema.Types.ObjectId, planId: mongoose.Schema.Types.ObjectId }],
}, { timestamps: true });
schema.index({ tenantId: 1, ownerId: 1, status: 1, nextContactAt: 1 });
module.exports = mongoose.model('ServiceIntake', schema);
