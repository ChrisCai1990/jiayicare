const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  creditCode: { type: String, default: '', trim: true, maxlength: 30 },
  leaderStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  authorizedRepresentativeStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  representativeVerifiedAt: { type: Date, default: null },
  representativeVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  memberStaffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }],
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  changeHistory: [{ at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    before: mongoose.Schema.Types.Mixed, after: mongoose.Schema.Types.Mixed }],
}, { timestamps: true });

schema.index({ tenantId: 1, leaderStaffId: 1, status: 1 });
schema.index({ tenantId: 1, authorizedRepresentativeStaffId: 1, status: 1 });
schema.index({ tenantId: 1, memberStaffIds: 1, status: 1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('CooperationProfessionalTeam', schema);
