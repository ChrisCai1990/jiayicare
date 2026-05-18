const mongoose = require('mongoose');

const shareTokenSchema = new mongoose.Schema({
  token:      { type: String, required: true, unique: true },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName:   { type: String, default: '' },    // 分享者姓名（快照，避免关联查询）
  period:     { type: String, required: true },  // 'week' | 'month'
  reportData: { type: mongoose.Schema.Types.Mixed }, // 报告完整快照
  expiresAt:  { type: Date, required: true },
  views:      { type: Number, default: 0 },
}, { timestamps: true });

// TTL 索引：到期自动删除
shareTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ShareToken', shareTokenSchema);
