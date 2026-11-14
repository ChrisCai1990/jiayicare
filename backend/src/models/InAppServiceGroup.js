const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  serviceType: { type: String, enum: ['advisor', 'nutrition', 'medical', 'specialty', 'legacy'], default: 'legacy' },
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
  createdByStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }],
  configuredByStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  membershipVersion: { type: Number, default: 0 },
  lastMessageAt: Date,
  lastCustomerMessageAt: Date,
  lastStaffMessageAt: Date,
  humanActiveUntil: Date,
}, { timestamps: true });
schema.index({ tenantId: 1, patientId: 1, serviceType: 1 }, { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_service_type' });

module.exports = mongoose.model('InAppServiceGroup', schema);
