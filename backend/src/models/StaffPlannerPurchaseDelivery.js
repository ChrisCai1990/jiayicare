const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  status: { type: String, enum: ['queued', 'sending', 'sent', 'skipped', 'failed'], default: 'queued' },
  reason: { type: String, default: '' },
  claimedAt: Date,
  finishedAt: Date,
}, { timestamps: true });

schema.index({ orderId: 1, staffId: 1 }, { unique: true });
schema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('StaffPlannerPurchaseDelivery', schema);
