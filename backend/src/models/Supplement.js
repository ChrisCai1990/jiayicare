const mongoose = require('mongoose');

const supplementSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // 基础信息
  name:       { type: String, required: true },   // 营养素名称（如维生素C、钙、蛋白粉）
  brand:      { type: String, default: '' },       // 品牌（可选）
  dosage:     { type: String, required: true },    // 剂量（如 500mg）
  method:     { type: String, default: '随餐' },   // 使用方法：随餐/空腹/冲服/睡前
  frequency:  { type: String, required: true },    // 使用频次（如每日1次、每周3次）
  startDate:  { type: String, default: '' },       // 开始补充日期
  endDate:    { type: String, default: '' },       // 计划结束日期
  purpose:    { type: String, default: '' },       // 补充目的/说明
  // 今日打卡
  lastCheckinDate: { type: String, default: '' }, // 最近打卡日期（YYYY-MM-DD）
  // 停用信息
  stopped:    { type: Boolean, default: false },   // 是否已停用
  stopDate:   { type: String, default: '' },       // 停用日期
  note:       { type: String, default: '' },
  // 医护端录入标识
  createdByStaff: { type: Boolean, default: false },
  staffId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  createdByName:  { type: String, default: '' },   // 新增操作人姓名（谁录入的）
  // 审核（场景10：营养师审核后激活）；健管专员/就医专员手动新增也走此审核流
  aiStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: null },
  aiGeneratedBy: { type: String, default: '' },
  reviewedByName: { type: String, default: '' },   // 审核人姓名（营养师）
  reviewedAt:     { type: Date, default: null },   // 审核时间
}, { timestamps: true });

supplementSchema.index({ user: 1, stopped: 1 });

module.exports = mongoose.model('Supplement', supplementSchema);
