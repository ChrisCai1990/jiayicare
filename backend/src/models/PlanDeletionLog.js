const mongoose = require('mongoose');

// 方案删除后保留完整快照，既不继续展示错误方案，也能追溯删除人和原因。
const planDeletionLogSchema = new mongoose.Schema({
  planId:     { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  planModel:  { type: String, enum: ['HealthPlan', 'AnnualPlan'], required: true },
  patientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  planType:   { type: String, default: '' },
  title:      { type: String, default: '' },
  deletedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  reason:     { type: String, required: true },
  snapshot:   { type: mongoose.Schema.Types.Mixed, required: true },
  relatedFollowUpsDeleted: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('PlanDeletionLog', planDeletionLogSchema);
