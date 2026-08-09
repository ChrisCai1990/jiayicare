const mongoose = require('mongoose');

// 随访删除审计：业务列表不再展示已删除计划，但保留删除人、原因和删除前快照供追溯。
const followUpDeletionLogSchema = new mongoose.Schema({
  followUpId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  patientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deletedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  reason:     { type: String, required: true },
  snapshot:   { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

module.exports = mongoose.model('FollowUpDeletionLog', followUpDeletionLogSchema);
