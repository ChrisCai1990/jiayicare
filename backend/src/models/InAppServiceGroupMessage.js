const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'InAppServiceGroup', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderType: { type: String, enum: ['customer', 'staff'], required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  senderName: { type: String, required: true, maxlength: 120 },
  content: { type: String, required: true, maxlength: 2000 },
}, { timestamps: true });
schema.index({ groupId: 1, createdAt: -1 });

module.exports = mongoose.model('InAppServiceGroupMessage', schema);
