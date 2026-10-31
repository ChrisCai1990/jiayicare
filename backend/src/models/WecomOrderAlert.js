const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUp', required: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  status: { type: String, enum: ['queued', 'sending', 'sent', 'skipped', 'failed'], default: 'queued' },
  reason: { type: String, default: '' },
  claimedAt: Date,
  finishedAt: Date,
}, { timestamps: true });

schema.index({ status: 1, createdAt: 1 });
schema.index({ staffId: 1, status: 1, finishedAt: -1 });
module.exports = mongoose.model('WecomOrderAlert', schema);
