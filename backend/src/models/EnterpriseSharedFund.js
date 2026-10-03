const mongoose = require('mongoose');

// One document per enterprise and health-management year. All balance moves and
// per-order state changes happen in one atomic MongoDB update (standalone-safe).
const schema = new mongoose.Schema({
  enterpriseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enterprise', required: true },
  year: { type: Number, required: true },
  enabled: { type: Boolean, default: false },
  policyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'EnterpriseInsurancePolicy' }],
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  creditedCents: { type: Number, default: 0 },
  availableCents: { type: Number, default: 0 },
  reservedCents: { type: Number, default: 0 },
  spentCents: { type: Number, default: 0 },
  credits: { type: mongoose.Schema.Types.Mixed, default: {} },
  entries: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
schema.index({ enterpriseId: 1, year: 1 }, { unique: true });
module.exports = mongoose.model('EnterpriseSharedFund', schema);
