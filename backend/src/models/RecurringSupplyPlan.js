const mongoose = require('mongoose');

// 定期配药/配营养素计划 —— 年度管理方案"药物管理""营养素管理"模块保存时生成，
// 与Medication/Supplement本身是两个层面：本模型只管"到期该去配了"这个提醒节奏
// （频率+配置机构+下次到期日），不代表已实际拿到药/营养素——客户/健管确认后
// 仍需去用药管理/营养素管理里手动录入实际到手的药品，避免"计划"和"实际执行"混淆。
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
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },   // 家庭医生
  // 待办生成状态：到期后生成一条待办给健管专员，aiStatus:'pending'接入现有待办面板；
  // 健管专员确认（对应实际配药/配营养素动作已安排）后置为'approved'，nextDueDate滚到下一周期
  aiStatus:       { type: String, enum: ['pending', 'approved'], default: null },
  lastNotifiedAt: { type: Date, default: null },        // 上次生成待办/提醒的时间，避免同一周期重复通知
}, { timestamps: true });

recurringSupplyPlanSchema.index({ patientId: 1, planType: 1 });
recurringSupplyPlanSchema.index({ enabled: 1, nextDueDate: 1 });

module.exports = mongoose.model('RecurringSupplyPlan', recurringSupplyPlanSchema);
