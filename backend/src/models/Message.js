const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:    { type: String, enum: ['doctor', 'manager', 'system', 'user'], required: true },
  sender:  { type: String, required: true },
  title:   { type: String },
  content: { type: String, required: true },
  unread:    { type: Boolean, default: true },
  readAt:    { type: Date },
  recipient: { type: String },  // 用户留言的目标角色：doctor/nutritionist/manager
}, { timestamps: true });

messageSchema.index({ user: 1, unread: 1 });

module.exports = mongoose.model('Message', messageSchema);
