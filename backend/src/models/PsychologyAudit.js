const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  careId: { type: mongoose.Schema.Types.ObjectId, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: { type: String, required: true },
}, { timestamps: true });
schema.index({ tenantId: 1, careId: 1, createdAt: -1 });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('PsychologyAudit', schema);
