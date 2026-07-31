const mongoose = require('mongoose');

const screeningYearSummarySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  year: { type: Number, required: true },
  sections: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      tumor_risk: { summary: '', sourceReportIds: [] },
      cardiovascular_risk: { summary: '', sourceReportIds: [] },
      chronic_disease: { summary: '', sourceReportIds: [] },
    },
  },
  status: { type: String, enum: ['draft', 'approved'], default: 'draft' },
  generatedByAI: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  createdByName: { type: String, default: '' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  approvedByName: { type: String, default: '' },
  approvedAt: { type: Date, default: null },
  // 同一年度允许多次形成小结。顶层字段继续镜像最新一条，兼容既有读取逻辑。
  records: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

screeningYearSummarySchema.index({ user: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('ScreeningYearSummary', screeningYearSummarySchema);
