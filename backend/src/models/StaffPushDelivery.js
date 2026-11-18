const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true, unique: true },
  status: { type: String, enum: ['queued', 'sending', 'sent', 'skipped', 'failed'], default: 'queued' },
  reason: { type: String, default: '' },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  claimedAt: Date,
  finishedAt: Date,
}, { timestamps: true });
schema.index({ status: 1, createdAt: 1 });
module.exports = mongoose.model('StaffPushDelivery', schema);
