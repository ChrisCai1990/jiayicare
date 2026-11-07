const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  advisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  psychologistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  status: { type: String, enum: ['active', 'paused', 'ended'], default: 'active' },
  sharedBackground: { type: String, required: true, maxlength: 20000 },
  sessions: [{ date: { type: Date, required: true }, content: { type: String, required: true, maxlength: 30000 }, nextDate: Date, authorId: mongoose.Schema.Types.ObjectId, createdAt: { type: Date, default: Date.now } }],
  history: [{ action: String, actorId: mongoose.Schema.Types.ObjectId, previousPersonId: mongoose.Schema.Types.ObjectId, nextPersonId: mongoose.Schema.Types.ObjectId, reason: String, at: { type: Date, default: Date.now } }],
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ tenantId: 1, patientId: 1 }, { unique: true });
schema.plugin(require('../utils/tenantScope').tenantScopePlugin);
module.exports = mongoose.model('PsychologyCare', schema);
