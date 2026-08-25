const mongoose = require('mongoose');

// 年度管理方案 — 每个会员每年一份，医护端配置
const annualPlanSchema = new mongoose.Schema({
  patientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planType:   { type: String, enum: ['health_reshape', 'young_state', 'chronic_stable', 'health_prevention'] },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanTemplate', default: null },
  templateName: { type: String, default: '' },
  year:       { type: Number, default: () => new Date().getFullYear() },
  moduleData: { type: mongoose.Schema.Types.Mixed, default: {} }, // { moduleKey: { enabled, field1, field2... } }
  notes:      { type: String, default: '' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  pushedAt:    { type: Date, default: null },
  pushedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  confirmedAt: { type: Date, default: null },
  customerStatus: { type: String, enum: ['draft', 'awaiting_confirmation', 'confirmed', 'changes_requested'], default: 'draft' },
  customerFeedback: { type: String, default: '' },
  customerFeedbackAt: { type: Date, default: null },
  version: { type: Number, default: 1, min: 1 },
  followUpsGeneratedAt: { type: Date, default: null },
  lastMonthlyReviewAt: { type: Date, default: null }, // 上次月度AI随访回顾时间，防止定时任务同月重复触发
}, { timestamps: true });

// 同一会员同一年度、每个方案类型各一份（4个类型独立存储，upsert）
annualPlanSchema.index({ patientId: 1, year: 1, planType: 1 }, { unique: true });

module.exports = mongoose.model('AnnualPlan', annualPlanSchema);
