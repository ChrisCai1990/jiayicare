const mongoose = require('mongoose');
const { tenantScopePlugin } = require('../utils/tenantScope');

// 报告事实审核完成后仍未能归入专项筛查目录的项目。它不是用户筛查记录，
// 只是一条医护端后续处理任务；只有人工确认归类后才可投影到 UserScreeningItem。
const reportScreeningCandidateSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', required: true, index: true },
  reportRevisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportRevision', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  sourceItemId: { type: String, required: true },
  itemSnapshot: {
    name: { type: String, default: '' },
    itemType: { type: String, default: '' },
    sourcePage: { type: Number, default: null },
    sourceSection: { type: String, default: '' },
    orderName: { type: String, default: '' },
    status: { type: String, default: '' },
  },
  status: { type: String, enum: ['pending', 'resolving', 'resolved', 'dismissed', 'superseded'], default: 'pending', index: true },
  resolvedScreeningKey: { type: String, default: '' },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  resolvedByName: { type: String, default: '' },
  resolvedAt: { type: Date, default: null },
  dismissReason: { type: String, default: '' },
}, { timestamps: true });

reportScreeningCandidateSchema.index({ reportRevisionId: 1, sourceItemId: 1 }, { unique: true });
reportScreeningCandidateSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
reportScreeningCandidateSchema.plugin(tenantScopePlugin);

module.exports = mongoose.model('ReportScreeningCandidate', reportScreeningCandidateSchema);
