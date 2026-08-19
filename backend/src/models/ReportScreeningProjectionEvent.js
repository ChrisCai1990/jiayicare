const mongoose = require('mongoose');
const { tenantScopePlugin } = require('../utils/tenantScope');

// 专项筛查是正式审核版本的派生读模型。当前投影可以被后续版本覆盖，
// 因此用追加式事件保留每一版新增/继续生效/撤销了哪些筛查项。
const reportScreeningProjectionEventSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', required: true, index: true },
  reportRevisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReportRevision', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  itemId: { type: String, required: true },
  sourceItemIds: [{ type: String }],
  action: { type: String, enum: ['activated', 'superseded'], required: true },
  source: { type: String, enum: ['automatic_match', 'candidate_resolution', 'version_reconcile'], required: true },
  actor: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    name: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  occurredAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

reportScreeningProjectionEventSchema.index(
  { reportRevisionId: 1, itemId: 1, action: 1 },
  { unique: true },
);
reportScreeningProjectionEventSchema.index({ reportId: 1, occurredAt: -1 });
reportScreeningProjectionEventSchema.plugin(tenantScopePlugin);

module.exports = mongoose.model('ReportScreeningProjectionEvent', reportScreeningProjectionEventSchema);
