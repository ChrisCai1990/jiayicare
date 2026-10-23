const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  requestId: { type: String, required: true },
  type: { type: String, enum: ['issue', 'use'], required: true },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'cancelled'], default: 'pending' },
  materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryMaterial', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  assignedHealthManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  delivery: {
    method: { type: String, enum: ['pickup', 'shipping'], required: true },
    pickupBy: { type: String, default: '' },
    recipientName: { type: String, default: '' },
    recipientPhone: { type: String, default: '' },
    deliveryAddress: { type: String, default: '' },
    carrier: { type: String, default: '' },
    trackingNo: { type: String, default: '' },
  },
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryEntry', default: null },
  processingAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  cancellationReason: { type: String, default: '' },
}, { timestamps: true })

schema.index({ tenantId: 1, requestId: 1 }, { unique: true })
schema.index({ tenantId: 1, status: 1, assignedHealthManagerId: 1, createdAt: 1 })
schema.plugin(require('../utils/tenantScope').tenantScopePlugin)
module.exports = mongoose.model('InventoryDispatchRequest', schema)
