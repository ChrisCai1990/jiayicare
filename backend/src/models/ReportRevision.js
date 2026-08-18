const mongoose = require('mongoose');
const { tenantScopePlugin } = require('../utils/tenantScope');

const revisionReviewSchema = new mongoose.Schema({
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewerName: { type: String, default: '' },
  reviewerRole: { type: String, default: '' },
  reviewedAt: { type: Date, required: true },
  action: { type: String, enum: ['submit', 'approve', 'legacy_backfill'], required: true },
  auditStatus: { type: String, default: '' },
}, { _id: false });

const revisionSourceSchema = new mongoose.Schema({
  extractionVersion: { type: Number, default: null },
  extractionOrigin: { type: String, default: '' },
  ocrVersion: { type: String, default: '' },
  files: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { _id: false });

// 人工提交后的正式报告快照。后续修改再次提交会产生新版本，
// 专项筛查只引用该快照而不引用可继续变化的 OCR 草稿。
const reportRevisionSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', required: true, index: true },
  extractionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportExtraction', default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  revisionNo: { type: Number, required: true },
  contentHash: { type: String, required: true },
  status: { type: String, enum: ['published', 'superseded'], default: 'published' },
  items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  aiSummary: { type: String, default: '' },
  reportMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
  review: { type: revisionReviewSchema, required: true },
  source: { type: revisionSourceSchema, default: () => ({}) },
  reviewMeta: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

reportRevisionSchema.index({ reportId: 1, revisionNo: 1 }, { unique: true });
reportRevisionSchema.index({ reportId: 1, contentHash: 1 });
reportRevisionSchema.plugin(tenantScopePlugin);

module.exports = mongoose.model('ReportRevision', reportRevisionSchema);
