const mongoose = require('mongoose');

// 模板驱动的阶段性评估只保存待审核建议，不会直接变更方案或向客户发布。
const phaseAssessmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  annualPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'AnnualPlan', required: true, index: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanTemplate', required: true },
  periodKey: { type: String, required: true }, // 例如 2026-08 / 2026-Q3，保证同一周期不重复
  periodLabel: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  content: { type: String, required: true },
  evidenceSources: { type: [String], default: [] },
  templateSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },
}, { timestamps: true });

phaseAssessmentSchema.index({ annualPlanId: 1, templateId: 1, periodKey: 1 }, { unique: true });

module.exports = mongoose.model('PhaseAssessment', phaseAssessmentSchema);
