const mongoose = require('mongoose');
module.exports = mongoose.model('WecomArchiveCursor', new mongoose.Schema({
  _id: String, seq: { type: Number, default: 0 }, lastSuccessAt: Date,
  lastErrorAt: Date, lastError: String, counters: mongoose.Schema.Types.Mixed,
  leaseOwner: String, leaseUntil: Date,
}, { timestamps: true }));
