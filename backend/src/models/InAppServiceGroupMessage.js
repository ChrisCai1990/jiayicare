const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'InAppServiceGroup', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderType: { type: String, enum: ['customer', 'staff', 'ai'], required: true },
  replyTo: { type: mongoose.Schema.Types.ObjectId, default: undefined },
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  senderName: { type: String, required: true, maxlength: 120 },
  content: { type: String, required: true, maxlength: 2000 },
  mentions: [{ _id: false, id: mongoose.Schema.Types.ObjectId, kind: { type: String, enum: ['staff', 'customer'] }, name: String, role: String }],
  mentionReadBy: [{ type: mongoose.Schema.Types.ObjectId }],
  eventKey: { type: String, default: undefined },
}, { timestamps: true });
schema.index({ groupId: 1, createdAt: -1 });
schema.index({ replyTo: 1 }, { unique: true, sparse: true });
schema.index({ eventKey: 1 }, { unique: true, sparse: true });
schema.index({ tenantId: 1, 'mentions.id': 1, createdAt: -1 });

module.exports = mongoose.model('InAppServiceGroupMessage', schema);
