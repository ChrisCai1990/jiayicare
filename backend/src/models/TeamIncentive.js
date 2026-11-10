const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  role: { type: String, enum: ['familyDoctor', 'nutritionist', 'healthManager'], required: true },
  trigger: { type: String, required: true },
  serviceEvidenceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamIncentiveRule', required: true },
  ruleVersion: { type: Number, required: true },
  basisCents: { type: Number, required: true, min: 0 },
  amountCents: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'confirmed', 'paid', 'cancelled', 'reversal_due'], default: 'pending' },
  confirmedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, orderId: 1, staffId: 1, role: 1, trigger: 1, serviceEvidenceId: 1 }, { unique: true });
schema.index({ tenantId: 1, staffId: 1, status: 1, createdAt: -1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('TeamIncentive', schema);
