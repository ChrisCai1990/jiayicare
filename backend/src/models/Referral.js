const mongoose = require('mongoose');
const { Schema } = mongoose;

const referralSchema = new Schema({
  fromStaffId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  toStaffId:   { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
  patientId:   { type: Schema.Types.ObjectId, ref: 'User',  required: true },
  reason:      { type: String, required: true },  // 转介原因（简述）
  content:     { type: String, default: '' },     // 详细说明
  urgency:     { type: String, enum: ['normal', 'urgent'], default: 'normal' },
  status:      { type: String, enum: ['pending', 'accepted', 'completed', 'rejected'], default: 'pending' },
  response:    { type: String, default: '' },     // 接收方回复
  respondedAt: { type: Date, default: null },
  attachedHealthInfo: { type: mongoose.Schema.Types.Mixed, default: null }, // A附带的健康档案摘要
}, { timestamps: true });

referralSchema.index({ toStaffId: 1, status: 1 });
referralSchema.index({ fromStaffId: 1 });
referralSchema.index({ patientId: 1 });

module.exports = mongoose.model('Referral', referralSchema);
