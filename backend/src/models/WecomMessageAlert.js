const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true, unique: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  conversationId: { type: String, default: '' },
  status: { type: String, enum: ['queued', 'sending', 'sent', 'skipped', 'failed'], default: 'queued' },
  reason: { type: String, default: '' },
  claimedAt: Date,
  finishedAt: Date,
}, { timestamps: true });

schema.index({ status: 1, createdAt: 1 });
schema.index({ staffId: 1, conversationId: 1, status: 1, finishedAt: -1 });
module.exports = mongoose.model('WecomMessageAlert', schema);
