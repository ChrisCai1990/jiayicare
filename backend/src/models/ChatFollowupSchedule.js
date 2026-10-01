const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String, activatedAt: Date, nextRunAt: Date, cycleStart: Date, cycleEnd: Date,
  cursor: { type: String, default: '' }, token: String, leaseUntil: Date,
}, { timestamps: true });
module.exports = mongoose.model('ChatFollowupSchedule', schema);
