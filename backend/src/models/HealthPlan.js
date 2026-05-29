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
  itemType:    { type: String, default: '' },  // 'labTest' | 'specialExam' | ''
}, { _id: true });

const healthPlanSchema = new mongoose.Schema({
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
  items:       [planItemSchema],
  // 随访计划专属
  followupFrequency: { type: String, default: '' }, // 如"每2周一次"
  followupResponsible: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
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

module.exports = mongoose.model('HealthPlan', healthPlanSchema);
