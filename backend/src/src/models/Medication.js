const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:      { type: String, required: true },
  dosage:    { type: String, required: true },
  frequency: { type: String, required: true },
  timing:    { type: String },
  startDate: { type: String },
  endDate:   { type: String },
  note:      { type: String, default: '' },
  active:    { type: Boolean, default: true },
  // 今日打卡记录
  checkIns: [{
    date:   { type: String }, // YYYY-MM-DD
    time:   { type: String },
    status: { type: String, enum: ['taken', 'missed', 'pending'], default: 'pending' },
  }],
}, { timestamps: true });

medicationSchema.index({ user: 1, active: 1 });

module.exports = mongoose.model('Medication', medicationSchema);
