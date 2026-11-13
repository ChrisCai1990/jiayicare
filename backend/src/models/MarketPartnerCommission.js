const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketPartner', required: true, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  attributionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketPartnerAttribution', required: true },
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketPartnerRule', required: true },
  ruleVersion: { type: Number, required: true },
  periodNumber: { type: Number, required: true, min: 1 },
  salesMonth: { type: String, required: true },
  eligibleCashCents: { type: Number, required: true, min: 0 },
  basisPoints: { type: Number, required: true, min: 0 },
  quickCloseCents: { type: Number, default: 0 },
  accruedCents: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['estimated', 'pending', 'partially_paid', 'paid', 'cancelled', 'reversal_due'], default: 'estimated' },
  serviceStartedAt: { type: Date, default: null },
  firstEligibleAt: { type: Date, default: null },
  finalEligibleAt: { type: Date, default: null },
  paidCents: { type: Number, default: 0, min: 0 },
  recoveredCents: { type: Number, default: 0, min: 0 },
  paymentReferences: [{ type: String }],
  recoveryReferences: [{ type: String }],
  ledger: [{
    key: { type: String, required: true },
    kind: { type: String, enum: ['accrual', 'recalculation', 'payment', 'refund', 'recovery'], required: true },
    amountCents: { type: Number, required: true },
    at: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    reason: { type: String, default: '' },
  }],
}, { timestamps: true });

schema.index({ tenantId: 1, orderId: 1, partnerId: 1 }, { unique: true });
schema.index({ tenantId: 1, partnerId: 1, salesMonth: 1, status: 1 });
schema.index({ tenantId: 1, paymentReferences: 1 }, { unique: true,
  partialFilterExpression: { paymentReferences: { $type: 'string' } } });
schema.index({ tenantId: 1, recoveryReferences: 1 }, { unique: true,
  partialFilterExpression: { recoveryReferences: { $type: 'string' } } });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

schema.post('save', async function (doc) {
  await require('../utils/partnerTeamEarning').syncSource('partnerCommission', doc);
});
schema.post('findOneAndUpdate', async function (doc) {
  if (doc) await require('../utils/partnerTeamEarning').syncSource('partnerCommission', doc);
});

module.exports = mongoose.model('MarketPartnerCommission', schema);
