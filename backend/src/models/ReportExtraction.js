const mongoose = require('mongoose');
const { tenantScopePlugin } = require('../utils/tenantScope');

// 一次 OCR 的不可变识别快照。它只保存结构化草稿和可追溯的来源信息，
// 不保存原始 PDF/Base64，也不替代 MedicalReport 作为原件入口。
const reportExtractionSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  version: { type: Number, required: true },
  status: { type: String, enum: ['ready_for_review', 'superseded'], default: 'ready_for_review' },
  origin: { type: String, enum: ['ocr', 'page_reparse', 'legacy'], default: 'ocr' },
  reparsePage: { type: Number, default: null },
  engine: {
    ocrVersion: { type: String, default: '' },
    templateId: { type: String, default: '' },
  },
  source: {
    ossKeys: [{ type: String }],
    pageCount: { type: Number, default: 0 },
  },
  reportMetadata: {
    institution: { type: String, default: '' },
    checkDate: { type: String, default: '' },
  },
  summary: { type: mongoose.Schema.Types.Mixed, default: null },
  items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  aiSummary: { type: String, default: '' },
}, { timestamps: true });

reportExtractionSchema.index({ reportId: 1, version: 1 }, { unique: true });
reportExtractionSchema.plugin(tenantScopePlugin);

module.exports = mongoose.model('ReportExtraction', reportExtractionSchema);
