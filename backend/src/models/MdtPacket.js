const mongoose = require('mongoose');

const mdtPacketSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  title: { type: String, required: true },
  consultationDate: { type: String, default: '' },
  disciplines: { type: String, default: '' },
  sections: { type: mongoose.Schema.Types.Mixed, default: {} },
  tables: { type: mongoose.Schema.Types.Mixed, default: {} },
  selectedReportIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport' }],
  basicSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  reportSnapshot: { type: mongoose.Schema.Types.Mixed, default: [] },
  sourceCapturedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['draft', 'reviewed'], default: 'draft' },
  reviewedByName: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
  reviewedHistory: { type: mongoose.Schema.Types.Mixed, default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true, optimisticConcurrency: true });

mdtPacketSchema.index({ patientId: 1, updatedAt: -1 });
mdtPacketSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('MdtPacket', mdtPacketSchema);
