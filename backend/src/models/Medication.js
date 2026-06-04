const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // 基础信息
  name:         { type: String, required: true },   // 化学名/通用名（必填）
  brandName:    { type: String, default: '' },       // 商品名（可选）
  dosage:       { type: String, required: true },    // 剂量（如 5mg）
  method:       { type: String, default: '口服' },   // 使用方法：口服/外用/注射/含服/吸入
  frequency:    { type: String, required: true },    // 使用频次
  timing:       { type: String },                    // 服药时机（早饭后等）
  startDate:    { type: String },                    // 开始使用日期
  // 停用信息
  endDate:      { type: String, default: '' },       // 计划结束日期
  purpose:      { type: String, default: '' },       // 用药目的/说明
  stopped:      { type: Boolean, default: false },   // 是否已停用
  stopDate:     { type: String, default: '' },       // 停用日期
  stopReason:   { type: String, default: '' },       // 停用原因（可选）
  note:         { type: String, default: '' },
  active:       { type: Boolean, default: true },
  // 医护端录入标识
  createdByStaff: { type: Boolean, default: false },
  staffId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  // 今日打卡记录
  checkIns: [{
    date:   { type: String }, // YYYY-MM-DD
    time:   { type: String },
    status: { type: String, enum: ['taken', 'missed', 'pending'], default: 'pending' },
  }],
}, { timestamps: true });

medicationSchema.index({ user: 1, active: 1 });

module.exports = mongoose.model('Medication', medicationSchema);
