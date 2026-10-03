const mongoose = require('mongoose');

// System push destination, separate from the existing in-app PushRecord inbox.
// _id is SHA-256(provider + token), ensuring one account owns a destination.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  provider: { type: String, enum: ['huawei'], required: true },
  token: { type: String, required: true, select: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sessionId: { type: String, required: true, select: false },
}, { timestamps: true });
schema.index({ user: 1, tenantId: 1 });
module.exports = mongoose.model('PushDevice', schema);
