const mongoose = require('mongoose');
const { tenantScopePlugin } = require('../utils/tenantScope');

// 每次正式审核动作的追加式审计事件。报告内容相同而复用既有 Revision 时，
// 审核动作仍在这里留痕；requestId 用于把网络重试收敛为同一事件。
const reportReviewEventSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', required: true, index: true },
  // 驳回发生在正式版本产生前，因此允许为空；通过/提交事件必须由业务层绑定正式版本。
  reportRevisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportRevision', default: null, index: true },
  extractionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportExtraction', default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  requestId: { type: String, required: true },
  action: { type: String, enum: ['submit', 'approve', 'reject', 'reconcile', 'legacy_backfill'], required: true },
  source: { type: String, enum: ['ocr_review', 'manual_audit', 'integrity_repair', 'legacy_backfill'], required: true },
  actor: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    name: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  occurredAt: { type: Date, required: true },
  contentHash: { type: String, required: true },
  result: { type: String, enum: ['published', 'deduplicated', 'rejected', 'reconciled'], required: true },
  summary: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

reportReviewEventSchema.index({ reportId: 1, requestId: 1 }, { unique: true });
reportReviewEventSchema.index({ reportId: 1, occurredAt: -1 });
reportReviewEventSchema.plugin(tenantScopePlugin);

module.exports = mongoose.model('ReportReviewEvent', reportReviewEventSchema);
