const mongoose = require('mongoose');

const loginSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionId: { type: String, required: true, unique: true, index: true },
  method: { type: String, enum: ['phone_wechat', 'phone'], required: true },
  loginAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },
  logoutAt: { type: Date, default: null },
  activeSeconds: { type: Number, default: 0 },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  device: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

loginSessionSchema.index({ user: 1, loginAt: -1 });

module.exports = mongoose.model('LoginSession', loginSessionSchema);
