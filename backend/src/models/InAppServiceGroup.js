const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
  createdByStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  lastMessageAt: Date,
  lastCustomerMessageAt: Date,
  lastStaffMessageAt: Date,
}, { timestamps: true });
schema.index({ tenantId: 1, patientId: 1 }, { unique: true });

module.exports = mongoose.model('InAppServiceGroup', schema);
