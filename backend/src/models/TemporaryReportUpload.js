const mongoose = require('mongoose');
const { tenantScopePlugin } = require('../utils/tenantScope');

// 医护端报告原件在正式建档前的服务端登记。登记本身不替代 MedicalReport，
// 仅用于阻止并发误删、追踪归属，并让客户端凭证过期后仍可安全回收孤儿对象。
const temporaryReportUploadSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  ossKey: { type: String, required: true, unique: true },
  fileUrl: { type: String, required: true },
  mimeType: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  // 上传时直接对收到的原始字节计算；后续建档和识别快照均引用该摘要，
  // 不依赖可变的下载 URL 来判断是否仍是同一份原件。
  sha256: { type: String, default: '' },
  status: {
    type: String,
    enum: ['temporary', 'attaching', 'attached', 'deleting', 'deleted', 'cleanup_failed'],
    default: 'temporary',
    index: true,
  },
  attachAttemptId: { type: String, default: '' },
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', default: null, index: true },
  expiresAt: { type: Date, required: true, index: true },
  attachedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  cleanupError: { type: String, default: '' },
}, { timestamps: true });

temporaryReportUploadSchema.index({ status: 1, expiresAt: 1 });
temporaryReportUploadSchema.plugin(tenantScopePlugin);

module.exports = mongoose.model('TemporaryReportUpload', temporaryReportUploadSchema);
