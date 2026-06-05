const mongoose = require('mongoose');

const verificationCodeSchema = new mongoose.Schema({
  phone:     { type: String, required: true, index: true },
  code:      { type: String, required: true },
  expiresAt: { type: Date,   required: true },
}, { timestamps: true });

// TTL 索引：MongoDB 自动清理过期文档
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('VerificationCode', verificationCodeSchema);
