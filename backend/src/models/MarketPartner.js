const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  productLine: { type: String, required: true, trim: true },
  status: { type: String, enum: ['draft', 'active', 'suspended', 'closed'], default: 'draft' },
  contractReference: { type: String, default: '' },
  referralCode: { type: String, required: true, uppercase: true, trim: true },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, referralCode: 1 }, { unique: true });
schema.index({ referralCode: 1 }, { unique: true });
schema.index({ tenantId: 1, phone: 1, status: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('MarketPartner', schema);
