const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requestTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUp', required: true, unique: true },
  followUpId: { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUp', required: true, unique: true },
  targetType: { type: String, enum: ['order', 'health_plan'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, required: true },
  status: { type: String, enum: ['waiting', 'completed', 'attention'], default: 'waiting', index: true },
  message: { type: String, default: '' },
  linkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ targetType: 1, targetId: 1, status: 1 });
require('../utils/outcomeEvidenceFence').outcomeEvidenceFence(schema);
module.exports = mongoose.model('FollowUpServiceLink', schema);
