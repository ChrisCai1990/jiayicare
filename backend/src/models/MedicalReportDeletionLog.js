const mongoose = require('mongoose');

const medicalReportDeletionLogSchema = new mongoose.Schema({
  reportId:      { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  patientId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:         { type: String, default: '' },
  uploadedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  deletedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  deletedByName: { type: String, default: '' },
  reason:        { type: String, required: true },
  snapshot:      { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

module.exports = mongoose.model('MedicalReportDeletionLog', medicalReportDeletionLogSchema);
