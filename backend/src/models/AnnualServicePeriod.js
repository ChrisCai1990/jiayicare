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
}, { timestamps: true });
schema.index({ sourceOrderId: 1 }, { unique: true, partialFilterExpression: { sourceOrderId: { $type: 'objectId' } } });
schema.index({ patientId: 1, contractReference: 1, startDate: 1 }, { unique: true, partialFilterExpression: { sourceType: 'offline_contract' } });
module.exports = mongoose.model('AnnualServicePeriod', schema);
