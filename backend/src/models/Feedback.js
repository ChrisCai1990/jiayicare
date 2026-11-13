const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  type:     { type: String, enum: ['意见建议', '功能异常', '数据问题', '账号注销申请', '其他'], default: '意见建议' },
  content:  { type: String, required: true },
  status:   { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  reply:    { type: String, default: '' },
  repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  repliedAt: { type: Date, default: null },
  workflowState: { type: String, enum: ['unassigned', 'assigned', 'submitted', 'closed'], default: 'unassigned' },
  workflowVersion: { type: Number, default: 0 },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  assignedName: { type: String, default: '' },
  assignedAt: { type: Date, default: null },
  assignmentNote: { type: String, default: '' },
  handlingResult: { type: String, default: '' },
  resultAt: { type: Date, default: null },
  workflowHistory: [{
    _id: false,
    action: { type: String, enum: ['assign', 'submit', 'close'] },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    actorName: String,
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    assigneeName: String,
    note: String,
    at: Date,
  }],
}, { timestamps: true });

feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ tenantId: 1, assignedTo: 1, status: 1, workflowState: 1 });
feedbackSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('Feedback', feedbackSchema);
