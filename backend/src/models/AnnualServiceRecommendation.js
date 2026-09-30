const mongoose = require('mongoose');

// 服务建议不是年度执行事项：发布及客户意向均不自动创建任务或订单。
const schema = new mongoose.Schema({
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'AnnualPlan', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  finding: { type: String, required: true, trim: true, maxlength: 300 },
  evidence: { type: String, required: true, trim: true, maxlength: 500 },
  recommendation: { type: String, required: true, trim: true, maxlength: 300 },
  timeframe: { type: String, trim: true, maxlength: 120, default: '' },
  plannedFollowUpDate: { type: String, default: '' }, // 内部联系/协调计划日期
  appointmentDate: { type: String, default: '' }, // 已与机构确认的服务日期
  nextStep: { type: String, trim: true, maxlength: 300, default: '' },
  selectedOptions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  response: { type: String, enum: ['none', 'interested', 'declined'], default: 'none' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  publishedAt: { type: Date, default: null },
  respondedAt: { type: Date, default: null },
  handledAt: { type: Date, default: null },
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  handlingNote: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true });

schema.index({ planId: 1, createdAt: 1 });
module.exports = mongoose.model('AnnualServiceRecommendation', schema);
