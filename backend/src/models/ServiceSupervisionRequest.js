const mongoose = require('mongoose');

// Internal staff correspondence only. Never an execution task or patient message.
const schema = new mongoose.Schema({
  _id: { type: String, required: true }, // deterministic source/version/kind/recipient key
  tenantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  patientId: { type: mongoose.Schema.Types.ObjectId, required: true },
  serviceKey: { type: String, required: true },
  version: { type: String, required: true },
  kind: { type: String, enum: ['remind', 'coordinate'], required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  senderName: String,
  recipientId: { type: mongoose.Schema.Types.ObjectId, required: true },
  recipientName: String,
  note: { type: String, required: true },
  handledAt: Date,
  response: String,
}, { timestamps: true });
schema.index({ tenantId: 1, recipientId: 1, handledAt: 1 });
schema.index({ tenantId: 1, patientId: 1, serviceKey: 1, createdAt: -1 });
module.exports = mongoose.model('ServiceSupervisionRequest', schema);
