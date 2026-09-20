const mongoose = require('mongoose');

// 方案中的单个项目（检查项、任务、随访节点等）
const planItemSchema = new mongoose.Schema({
  name:        { type: String, required: true },  // 项目名称，如"颈动脉超声"
  category:    { type: String, default: '' },      // 分类，如"血液检查""影像检查"
  scheduledDate:{ type: Date, default: null },     // 计划时间
  notes:       { type: String, default: '' },      // 注意事项
  status: {
    type: String,
    enum: ['pending', 'completed', 'skipped'],
    default: 'pending',
  },
  completedAt: { type: Date, default: null },
  reportId:    { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', default: null },
  // 关联检验检查库
  itemId:      { type: mongoose.Schema.Types.ObjectId, default: null },
  itemType:    { type: String, default: '' },  // 'labTest' | 'specialExam' | 'followUpPlan' | ''
  // 关联随访表（随访节点专用）
  formId:      { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUpForm', default: null },
  // 年度体检方案专用：区分是体检中心标准套餐项目还是AI建议的可选加项，前端据此展示"基础项/加项"徽标
  // （2026-07-17需求：套餐基础项和加项要明确区分，加项要标注检查意义）
  itemGroup:   { type: String, enum: ['base', 'addon', ''], default: '' },
  precautionKey: { type: String, default: '' },
  precautionTitle: { type: String, default: '' },
  isImportantPrecaution: { type: Boolean, default: false },
}, { _id: true });

const healthPlanSchema = new mongoose.Schema({
  reportItemWriteFences: { type: mongoose.Schema.Types.Mixed, default: {} }, // report ID -> latest accepted write epoch
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  staffId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  type: {
    type: String,
    enum: [
      'checkup',          // 体检方案（旧）
      'health',           // 健康管理方案（旧）
      'followup',         // 随访计划（旧）
      'nutrition',        // 营养干预方案
      'rehab',            // 运动康复方案（旧）
      'tcm',              // 中医方案
      'annual_checkup',   // 年度体检方案（新）
      'annual_mgmt',      // 年度管理方案（新）
      'medical_assist',   // 就医协助方案（新）
      'psychology',       // 心理咨询方案（新）
    ],
    required: true,
  },
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  year:        { type: Number, default: () => new Date().getFullYear() },
  startDate:   { type: Date, default: null },
  endDate:     { type: Date, default: null },
  checkupDate: { type: Date, default: null },     // 年度体检方案统一体检时间
  items:       [planItemSchema],
  // 随访计划专属
  followupFrequency: { type: String, default: '' }, // 如"每2周一次"
  followupResponsible: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  // 结构化内容（年度管理方案板块数据；营养/就医模板内容）
  content: { type: mongoose.Schema.Types.Mixed, default: {} },
  // 来源商城订单（就医协助方案等由订单触发生成时关联，用于订单-方案-随访状态联动追溯）
  sourceOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  // 独立体检准备来源：不可由通用内容编辑移除，也不回退匹配旧服务。
  preparationTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUp', immutable: true },
  // Durable opt-in outbox, written with a newly created preparation draft only.
  preparationAddonAuto: { type: Boolean, immutable: true },
  // Applied atomically with selected items; not accepted by generic plan editing.
  preparationAddonReview: { type: mongoose.Schema.Types.Mixed, default: null },
  // 无订单的医护端发起服务也遵循与订单相同的统一归属语义。
  initiationSource: { type: String, enum: ['customer', 'staff', 'admin', 'system'], default: 'staff', index: true },
  initiatedByStaff: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
  currentStage: { type: String, default: 'intake' },
  currentAssignee: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  closureMode: { type: String, enum: ['automatic', 'planner_review'], default: 'planner_review' },
  supervisionStatus: { type: String, enum: ['pending_intake', 'in_progress', 'needs_attention', 'pending_closure', 'completed', 'cancelled'], default: 'pending_intake' },
  // 状态
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'cancelled'],
    default: 'draft',
  },
  // 推送至客户端
  pushedAt:    { type: Date, default: null },
  confirmedAt: { type: Date, default: null }, // 客户确认时间
  viewedAt:    { type: Date, default: null },  // 客户首次查阅时间
  // 客户端显示摘要
  summary:     { type: String, default: '' },
}, { timestamps: true });

healthPlanSchema.index({ patientId: 1, type: 1, createdAt: -1 });
healthPlanSchema.index({ staffId: 1, createdAt: -1 });

healthPlanSchema.plugin(require('../utils/followUpServiceLinkPlugin'), { targetType: 'health_plan' });
module.exports = mongoose.model('HealthPlan', healthPlanSchema);
