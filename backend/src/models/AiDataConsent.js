const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  purpose: { type: String, required: true },
  provider: { type: String, required: true },
  version: { type: String, required: true },
  granted: { type: Boolean, default: false },
  revision: { type: Number, default: 0 },
  events: [{ granted: Boolean, at: Date, version: String, actor: mongoose.Schema.Types.ObjectId }],
}, { timestamps: true });
schema.index({ user: 1, purpose: 1, provider: 1 }, { unique: true });
module.exports = mongoose.model('AiDataConsent', schema);
