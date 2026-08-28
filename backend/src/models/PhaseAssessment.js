const mongoose = require('mongoose');

// 模板驱动的阶段性评估只保存待审核建议，不会直接变更方案或向客户发布。
const phaseAssessmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  annualPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'AnnualPlan', required: true, index: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanTemplate', required: true },
  assessmentMode: { type: String, enum: ['routine', 'intensive_nutrition'], default: 'routine', index: true },
  sourceNutritionPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan', default: null },
  interventionWeek: { type: Number, default: null },
  periodKey: { type: String, required: true }, // 例如 2026-08 / 2026-Q3，保证同一周期不重复
  periodLabel: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'nutrition_review', 'doctor_review', 'finalized', 'approved', 'rejected'],
    default: 'nutrition_review', index: true,
  },
  content: { type: String, required: true },
  evidenceSources: { type: [String], default: [] },
  templateSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  clinicalReview: {
    required: { type: Boolean, default: false },
    reasons: { type: [String], default: [] },
    forcedByRule: { type: Boolean, default: false },
    escalatedByNutritionist: { type: Boolean, default: false },
  },
  nutritionReview: {
    status: { type: String, enum: ['pending', 'approved', 'returned', 'escalated', ''], default: 'pending' },
    note: { type: String, default: '' }, reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewedByName: { type: String, default: '' }, reviewedAt: { type: Date, default: null },
  },
  doctorReview: {
    status: { type: String, enum: ['pending', 'approved', 'returned', ''], default: '' },
    note: { type: String, default: '' }, reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewedByName: { type: String, default: '' }, reviewedAt: { type: Date, default: null },
  },
  finalizedAt: { type: Date, default: null },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 兼容旧记录
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },
  auditLog: [{ action: String, fromStatus: String, toStatus: String, note: String, staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, staffName: String, staffRole: String, at: { type: Date, default: Date.now } }],
}, { timestamps: true });

phaseAssessmentSchema.index({ annualPlanId: 1, templateId: 1, periodKey: 1 }, { unique: true });

module.exports = mongoose.model('PhaseAssessment', phaseAssessmentSchema);
