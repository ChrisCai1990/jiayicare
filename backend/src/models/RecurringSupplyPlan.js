const mongoose = require('mongoose');

// 定期配药/配营养素计划 —— 年度管理方案"药物管理""营养素管理"模块保存时生成，
// 与Medication/Supplement本身是两个层面：本模型管理“补充周期与履约流程”，
// 不代表已实际拿到药/营养素。完成后仍由实际到手记录更新用药/营养素档案。
const recurringSupplyPlanSchema = new mongoose.Schema({
  patientId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planType:       { type: String, enum: ['medication', 'supplement'], required: true },
  itemName:       { type: String, required: true },   // 药品/营养素名称
  dosage:         { type: String, default: '' },       // 剂量
  frequency:      { type: String, required: true },    // 配药/配营养素频率文案，如"每月一次"
  institution:    { type: String, default: '' },       // 配置机构（药房/医院/渠道）
  notes:          { type: String, default: '' },
  nextDueDate:    { type: Date, required: true },       // 下次到期日，定时任务按此生成待办
  enabled:        { type: Boolean, default: true },     // 关闭后定时任务跳过，不再生成新的待办
  sourceAnnualPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'AnnualPlan' },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },   // 健康顾问
  leadDays:       { type: Number, default: 3, min: 3 }, // 所有品类至少预留3天
  workflowStatus: {
    type: String,
    enum: ['idle', 'intake_pending', 'risk_review_pending', 'info_required', 'arrangement_pending', 'fulfillment_pending', 'receipt_pending', 'paused'],
    default: 'idle',
  },
  // customer_self：客户自购；online_assisted：线上协助采购；hospital_assisted：医院预约/配药；
  // internal_product：仅用于自研营养代餐等自有商品履约。
  fulfillmentMode: {
    type: String,
    enum: ['undecided', 'customer_self', 'online_assisted', 'hospital_assisted', 'internal_product'],
    default: 'undecided',
  },
  cycleStartedAt: { type: Date, default: null },
  intake:         { type: mongoose.Schema.Types.Mixed, default: {} },
  aiRiskDraft:    { type: mongoose.Schema.Types.Mixed, default: {} },
  riskReview:     { type: mongoose.Schema.Types.Mixed, default: {} },
  arrangement:    { type: mongoose.Schema.Types.Mixed, default: {} },
  fulfillment:    { type: mongoose.Schema.Types.Mixed, default: {} },
  receipt:        { type: mongoose.Schema.Types.Mixed, default: {} },
  auditLog:       { type: [mongoose.Schema.Types.Mixed], default: [] },
  // 待办生成状态：到期后生成一条待办给健管专员，aiStatus:'pending'接入现有待办面板；
  // 健管专员确认（对应实际配药/配营养素动作已安排）后置为'approved'，nextDueDate滚到下一周期
  aiStatus:       { type: String, enum: ['pending', 'approved'], default: null },
  lastNotifiedAt: { type: Date, default: null },        // 上次生成待办/提醒的时间，避免同一周期重复通知
}, { timestamps: true });

recurringSupplyPlanSchema.index({ patientId: 1, planType: 1 });
recurringSupplyPlanSchema.index({ enabled: 1, nextDueDate: 1 });
recurringSupplyPlanSchema.index({ workflowStatus: 1, nextDueDate: 1 });

module.exports = mongoose.model('RecurringSupplyPlan', recurringSupplyPlanSchema);
