const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: { type: String, required: true }, // One job per already-saved human message.
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
  state: { type: String, enum: ['pending', 'working', 'done', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  dueAt: { type: Date, default: Date.now },
  leaseUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ state: 1, dueAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('NativePushJob', schema);
