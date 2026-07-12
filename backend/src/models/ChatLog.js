const mongoose = require('mongoose');

const chatLogSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role:       { type: String, default: 'manager' },
  intent:     { type: String, enum: ['service', 'knowledge', 'data', 'out_of_scope'], default: 'knowledge' },
  userMessage:{ type: String, required: true },
  aiReply:    { type: String, default: '' },
  transferred:{ type: Boolean, default: false }, // 是否转人工
  resolved:   { type: Boolean, default: false }, // 转人工待办是否已被医护端处理（联系患者后标记）
  tokens:     { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
}, { timestamps: true });

chatLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ChatLog', chatLogSchema);
