const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  sourceType: { type: String, enum: ['staffCommission', 'partnerCommission', 'orderService'], required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sourceKey: { type: String, default: '' },
  relationId: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerTeamRelation', required: true },
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerTeamRule', required: true },
  ruleVersion: { type: Number, required: true },
  leaderType: { type: String, enum: ['staff', 'partner'], required: true },
  leaderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  memberType: { type: String, enum: ['staff', 'partner'], required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, required: true },
  activity: { type: String, enum: ['promotion', 'service'], required: true },
  calculationType: { type: String, enum: ['percentage', 'fixedAmount'], required: true },
  basisPoints: { type: Number, default: 0 },
  fixedCents: { type: Number, default: 0 },
  basisCents: { type: Number, required: true, min: 0 },
  accruedCents: { type: Number, required: true, min: 0 },
  paidCents: { type: Number, default: 0, min: 0 },
  recoveredCents: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['estimated', 'pending', 'paid', 'reversal_due', 'cancelled'], required: true },
  eligibleAt: { type: Date, default: null },
  paymentReferences: [{ type: String }],
  recoveryReferences: [{ type: String }],
  ledger: [{ kind: { type: String, enum: ['accrual', 'recalculation', 'payment', 'recovery'], required: true },
    amountCents: { type: Number, required: true }, at: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    reference: { type: String, default: '' } }],
}, { timestamps: true });

schema.index({ tenantId: 1, sourceType: 1, sourceId: 1, sourceKey: 1 }, { unique: true });
schema.index({ tenantId: 1, leaderType: 1, leaderId: 1, status: 1 });
schema.index({ tenantId: 1, orderId: 1 });
schema.index({ tenantId: 1, paymentReferences: 1 }, { unique: true,
  partialFilterExpression: { paymentReferences: { $type: 'string' } } });
schema.index({ tenantId: 1, recoveryReferences: 1 }, { unique: true,
  partialFilterExpression: { recoveryReferences: { $type: 'string' } } });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('PartnerTeamEarning', schema);
