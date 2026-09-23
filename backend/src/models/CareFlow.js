const mongoose = require('mongoose');
// One atomic aggregate per annual service request. Clinical/annual source documents
// are never rewritten; each transition retains before/after and actor snapshots.
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId },
  tenantId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  annualPlanId: { type: mongoose.Schema.Types.ObjectId },
  revision: { type: Number, default: 0 },
  state: { type: mongoose.Schema.Types.Mixed, required: true },
  events: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });
schema.index({ tenantId: 1, updatedAt: -1 });
module.exports = mongoose.model('CareFlow', schema);
