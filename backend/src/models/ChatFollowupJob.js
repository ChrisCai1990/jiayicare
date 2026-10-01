const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String,
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  status: { type: String, default: 'idle' },
  token: String, leaseUntil: Date, cycle: String,
  recordId: mongoose.Schema.Types.ObjectId,
  rangeStart: Date, rangeEnd: Date,
  error: String, handledAt: Date, handledBy: mongoose.Schema.Types.ObjectId, handlingNote: String,
}, { timestamps: true });
module.exports = mongoose.model('ChatFollowupJob', schema);
