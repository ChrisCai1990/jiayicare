const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'InAppServiceGroup', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  viewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  viewedAt: { type: Date, default: Date.now },
  messageCount: { type: Number, required: true },
}, { timestamps: false });
schema.index({ groupId: 1, viewedAt: -1 });

module.exports = mongoose.model('InAppServiceGroupView', schema);
