const mongoose = require('mongoose');

// Staff-only evidence; never embed clinical source snapshots in customer plans.
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan' },
  token: { type: String, required: true },
  status: { type: String, enum: ['queued', 'running', 'ready', 'skipped', 'failed'], required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUp' },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  input: { type: mongoose.Schema.Types.Mixed, default: null },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  message: { type: String, default: '' },
  startedAt: Date,
  finishedAt: Date,
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });
module.exports = mongoose.model('CheckupPreparationSuggestion', schema);
