const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  type:     { type: String, enum: ['意见建议', '功能异常', '数据问题', '其他'], default: '意见建议' },
  content:  { type: String, required: true },
  status:   { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  reply:    { type: String, default: '' },
  repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  repliedAt: { type: Date, default: null },
}, { timestamps: true });

feedbackSchema.index({ createdAt: -1 });
feedbackSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('Feedback', feedbackSchema);
