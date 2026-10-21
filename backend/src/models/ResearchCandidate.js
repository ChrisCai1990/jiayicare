const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  action: { type: String, enum: ['add', 'remove'], required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  at: { type: Date, required: true },
}, { _id: false });

const schema = new mongoose.Schema({
  studyCode: { type: String, required: true, default: 'wonca_2027', index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['active', 'removed'], default: 'active', index: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  addedAt: { type: Date, required: true },
  removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  removedAt: { type: Date, default: null },
  history: { type: [historySchema], default: [] },
}, { timestamps: true });

schema.index({ studyCode: 1, patientId: 1 }, { unique: true });
module.exports = mongoose.model('ResearchCandidate', schema);
