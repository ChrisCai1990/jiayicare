const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  role: { type: String, enum: ['familyDoctor', 'nutritionist', 'healthManager'], required: true },
  trigger: { type: String, required: true },
  serviceEvidenceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  serviceItemKey: { type: String, default: '' },
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamIncentiveRule', required: true },
  ruleVersion: { type: Number, required: true },
  basisCents: { type: Number, required: true, min: 0 },
  amountCents: { type: Number, required: true, min: 0 },
  paidCents: { type: Number, default: 0, min: 0 },
  recoveredCents: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['pending', 'confirmed', 'paid', 'cancelled', 'reversal_due'], default: 'pending' },
  confirmedAt: { type: Date, default: null },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  paidAt: { type: Date, default: null },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  paymentReference: { type: String, default: null },
  recoveryReferences: [{ type: String }],
  note: { type: String, default: '' },
  adjustments: [{ basisCents: Number, amountCents: Number, at: Date, reason: String }],
}, { timestamps: true });

schema.index({ tenantId: 1, orderId: 1, staffId: 1, role: 1, trigger: 1, serviceEvidenceId: 1 }, { unique: true });
// One service evidence/role may be credited to one performer only, including concurrent claims.
schema.index({ tenantId: 1, orderId: 1, role: 1, trigger: 1, serviceEvidenceId: 1 }, { unique: true });
schema.index({ tenantId: 1, staffId: 1, status: 1, createdAt: -1 });
schema.index({ tenantId: 1, paymentReference: 1 }, { unique: true,
  partialFilterExpression: { paymentReference: { $type: 'string' } } });
schema.index({ tenantId: 1, recoveryReferences: 1 }, { unique: true,
  partialFilterExpression: { recoveryReferences: { $type: 'string' } } });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('TeamIncentive', schema);
