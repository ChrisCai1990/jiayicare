const mongoose = require('mongoose');

// 年度管理方案 — 每个会员每年一份，医护端配置
const annualPlanSchema = new mongoose.Schema({
  patientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // planType暂时保留为唯一索引键：新方案写入7个服务版本编码，旧方案仍可使用4个策略编码。
  planType:   { type: String, enum: ['health_reshape', 'young_state', 'chronic_stable', 'health_prevention', 'jys_young', 'jys_stable', 'jys_reshape', 'jys_advisor', 'jygj_escort', 'jygj_prevention', 'jygj_light'] },
  servicePlanCode: { type: String, default: '', index: true },
  strategyType: { type: String, enum: ['health_reshape', 'young_state', 'chronic_stable', 'health_prevention', ''], default: '' },
  clientBrand: { type: String, enum: ['jiayiguanjia', 'jinyisen', ''], default: '' },
  memberTypeSnapshot: { type: String, default: '' },
  servicePackageSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  entitlementSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  resourceSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanTemplate', default: null },
  templateName: { type: String, default: '' },
  templateSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  year:       { type: Number, default: () => new Date().getFullYear() },
  moduleData: { type: mongoose.Schema.Types.Mixed, default: {} }, // { moduleKey: { enabled, field1, field2... } }
  notes:      { type: String, default: '' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  reviewStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },
  pushedAt:    { type: Date, default: null },
  pushedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  confirmedAt: { type: Date, default: null },
  // 正式方案每个服务年度只能有一份；推送时正式化，客户确认后冻结。
  formalizedAt: { type: Date, default: null },
  frozenAt: { type: Date, default: null },
  lastMonthlyReviewAt: { type: Date, default: null }, // 上次月度AI随访回顾时间，防止定时任务同月重复触发
}, { timestamps: true });

// 同一会员同一年度、每个方案类型各一份（4个类型独立存储，upsert）
annualPlanSchema.index({ patientId: 1, year: 1, planType: 1 }, { unique: true });
annualPlanSchema.index({ patientId: 1, year: 1, formalizedAt: 1 });

module.exports = mongoose.model('AnnualPlan', annualPlanSchema);
