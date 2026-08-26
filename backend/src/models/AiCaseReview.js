const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['staff', 'ai'], required: true },
  content: { type: String, required: true },
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  staffName: { type: String, default: '' },
  staffRole: { type: String, default: '' },
  evidenceRefs: [{ type: String }],
  missingInfo: [{ type: String }],
  riskFlags: [{ type: String }],
  provider: { type: String, default: '' },
  providerModel: { type: String, default: '' },
  durationMs: { type: Number, default: 0 },
  attachments: [{
    name: { type: String, default: '' },
    url: { type: String, default: '' },
    mimeType: { type: String, default: '' },
  }],
  contextSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const conclusionSchema = new mongoose.Schema({
  content: { type: String, default: '' },
  structured: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, enum: ['draft', 'confirmed'], default: 'draft' },
  generatedAt: { type: Date, default: null },
  confirmedAt: { type: Date, default: null },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  confirmedByName: { type: String, default: '' },
  serviceRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRecord', default: null },
}, { _id: false });

const aiCaseReviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', maxlength: 1000 },
  reviewType: { type: String, enum: ['checkup', 'nutrition', 'annual', 'assessment', 'medical', 'daily', 'custom'], default: 'custom', index: true },
  status: { type: String, enum: ['active', 'concluded', 'archived'], default: 'active', index: true },
  contextScopes: [{
    type: String,
    enum: ['basic', 'healthProfile', 'reports', 'healthRecords', 'medications', 'followups', 'plans', 'aiAnalysis'],
  }],
  // 研判功能当前仅使用通义千问；保留旧值的兼容性由路由在写入时统一归一。
  preferredProvider: { type: String, enum: ['auto', 'workbuddy', 'qwen', 'deepseek'], default: 'qwen' },
  providerSessionId: { type: String, default: '' },
  messages: [messageSchema],
  conclusion: { type: conclusionSchema, default: () => ({}) },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  createdByName: { type: String, default: '' },
  lastActivityAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

aiCaseReviewSchema.index({ user: 1, status: 1, lastActivityAt: -1 });

module.exports = mongoose.model('AiCaseReview', aiCaseReviewSchema);
