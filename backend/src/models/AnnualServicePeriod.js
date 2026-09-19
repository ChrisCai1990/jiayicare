const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  annualPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'AnnualPlan', required: true, unique: true },
  sourceType: { type: String, enum: ['paid_order', 'offline_contract'], required: true },
  sourceOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  contractReference: { type: String, default: '' },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  evidenceSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  legacyServiceWindow: { type: mongoose.Schema.Types.Mixed, default: null },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  confirmedAt: { type: Date, required: true },
  activationStatus: { type: String, enum: ['waiting', 'active', 'failed'], default: 'waiting' },
  activationError: { type: String, default: '' },
  activatedAt: { type: Date, default: null },
  syncAttemptId: { type: String, default: '' },
  syncState: { type: String, enum: ['idle', 'running', 'failed', 'blocked'], default: 'idle' },
  syncStartedAt: { type: Date, default: null },
  syncIssue: { type: mongoose.Schema.Types.Mixed, default: null },
  lastSyncSuccessAt: { type: Date, default: null },
  correctionRevision: { type: Number, default: 0 },
  correction: { type: mongoose.Schema.Types.Mixed, default: null },
  correctionHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  executionAnchor: { type: Date, default: null },
  scheduleAmendments: { type: [mongoose.Schema.Types.Mixed], default: [] },
  evidenceOrderIds: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
}, { timestamps: true });
schema.index({ sourceOrderId: 1 }, { unique: true, partialFilterExpression: { sourceOrderId: { $type: 'objectId' } } });
// 更换凭据后历史订单仍属于原服务期，不能被另一年度重复消费。
schema.index({ evidenceOrderIds: 1 }, { unique: true, sparse: true });
schema.index({ patientId: 1, contractReference: 1, startDate: 1 }, { unique: true, partialFilterExpression: { sourceType: 'offline_contract' } });
module.exports = mongoose.model('AnnualServicePeriod', schema);
