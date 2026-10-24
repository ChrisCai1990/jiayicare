const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year: { type: Number, required: true },
  sourceKey: { type: String, required: true },
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', required: true },
  itemId: { type: String, default: '' },
  title: { type: String, required: true },
  direction: { type: String, enum: ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'monitoring', 'ongoing_management'], required: true },
  note: { type: String, default: '' },
  sourceSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  reviewedAt: { type: Date, required: true },
}, { timestamps: true });

schema.index({ patientId: 1, year: 1, sourceKey: 1 }, { unique: true });
module.exports = mongoose.model('AnnualManagementDecision', schema);
