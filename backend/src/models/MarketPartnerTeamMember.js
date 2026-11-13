const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketPartner', required: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  phone: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  changeHistory: [{
    at: { type: Date, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    reason: { type: String, required: true },
    before: { type: mongoose.Schema.Types.Mixed, required: true },
    after: { type: mongoose.Schema.Types.Mixed, required: true },
  }],
}, { timestamps: true });

schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MarketPartnerTeamMember', schema);
