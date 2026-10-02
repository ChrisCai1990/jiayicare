const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  // Reuse the user id as the enrollment id: no secondary unique index is required for a singleton pilot.
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  allowed: { type: Boolean, default: false },
  status: { type: String, enum: ['invited', 'active', 'paused', 'withdrawn', 'completed'], default: 'invited' },
  version: { type: String, default: 'weight-awareness-v1' },
  eligibilityConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  eligibilityNote: String,
  invitedAt: Date, startedAt: Date, endsAt: Date, consentAt: Date,
  goal: { type: String, default: '' },
  reminderEnabled: { type: Boolean, default: false },
  reminderEveryDays: { type: Number, default: 3 },
  actionChoice: { id: String, choice: String, at: Date },
  reflections: [{ day: Number, text: String, at: Date }],
  help: { status: { type: String, enum: ['open','closed',null], default: null }, requestedAt: Date,
    message: String, assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    source: String, reply: String, closedAt: Date, closedBy: mongoose.Schema.Types.ObjectId },
  humanMinutes: { type: Number, default: 0 },
  history: [{ at: Date, actor: String, action: String, note: String, minutes: Number }],
}, { timestamps: true, versionKey: 'revision', optimisticConcurrency: true });
module.exports = mongoose.model('MetabolicPilot', schema);
