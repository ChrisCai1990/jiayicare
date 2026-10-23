const mongoose = require('mongoose');

// Append-only record. Corrections are new entries; an order is never rewritten here.
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  sourceReceiptId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryEntry', default: null },
  materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryMaterial', default: null },
  serviceProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  sourceOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  requestId: { type: String },
  type: { type: String, enum: ['opening', 'receipt', 'issue', 'use', 'return', 'loss', 'count', 'manual_sale', 'reversal', 'customer_return'], required: true },
  reversesEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryEntry', default: null },
  returnsEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryEntry', default: null },
  quantity: { type: Number, required: true }, // signed change to available stock
  units: { type: Number, required: true, min: 0 }, // actual units moved or used
  fromIssued: { type: Boolean, default: false },
  balanceAfter: { type: Number, required: true },
  batchNo: { type: String, default: '', trim: true },
  serialNo: { type: String, default: '', trim: true },
  expiresAt: { type: Date, default: null },
  location: { type: String, default: '', trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  unitCost: { type: Number, default: 0 },
  unitPrice: { type: Number, default: 0 },
  note: { type: String, default: '', trim: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  dispatchRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryDispatchRequest', default: null },
  delivery: {
    method: { type: String, enum: ['pickup', 'shipping'], default: null },
    pickupBy: { type: String, default: '' },
    recipientName: { type: String, default: '' },
    recipientPhone: { type: String, default: '' },
    deliveryAddress: { type: String, default: '' },
    carrier: { type: String, default: '' },
    trackingNo: { type: String, default: '' },
  },
}, { timestamps: true });

schema.index({ tenantId: 1, productId: 1, createdAt: -1 });
schema.index({ tenantId: 1, userId: 1, createdAt: -1 });
schema.index({ tenantId: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });
schema.index({ tenantId: 1, reversesEntryId: 1 }, { unique: true, partialFilterExpression: { reversesEntryId: { $type: 'objectId' } } });
schema.index({ tenantId: 1, orderId: 1, type: 1 }, { unique: true, partialFilterExpression: { orderId: { $type: 'objectId' }, type: 'use' } });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('InventoryEntry', schema);
