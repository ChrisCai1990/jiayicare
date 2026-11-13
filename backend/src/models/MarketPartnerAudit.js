const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  subjectType: { type: String, required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: { type: String, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reason: { type: String, default: '' },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, subjectType: 1, subjectId: 1, createdAt: -1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('MarketPartnerAudit', schema);
