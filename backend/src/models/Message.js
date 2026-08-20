const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:    { type: String, enum: ['doctor', 'manager', 'system', 'user', 'nutritionist'], required: true },
  sender:  { type: String, required: true },
  title:   { type: String },
  content: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  imageUrls: { type: [String], default: [] },
  audioUrl: { type: String, default: '' },
  audioDuration: { type: Number, default: 0, min: 0, max: 60 },
  audioMimeType: { type: String, default: '' },
  aiReviewStatus: { type: String, enum: ['', 'draft', 'pending', 'approved', 'rejected'], default: '' },
  aiReviewedAt: { type: Date, default: null },
  aiReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  unread:      { type: Boolean, default: true },
  readAt:      { type: Date },
  staffReadAt: { type: Date },  // 医护端已读时间（null = 医护未读）
  recipient: { type: String },  // 用户留言的目标角色：doctor/nutritionist/manager
  conversationId: { type: String, index: true, default: null }, // {userId}_{role} 会话线程标识
  isAI: { type: Boolean, default: false }, // 医护未及时回复时AI代为兜底回复的消息（不涉及诊断/建议），医护人工回复后仍可正常追加
  aiGenerated: { type: Boolean, default: false },
  // 可操作消息：消息中心据此渲染操作按钮/跳转，让用户不必自己找入口。
  // 目前用于家庭成员邀请：{ type:'family_invite', inviteId, route:'FamilyMembers' }
  action: { type: mongoose.Schema.Types.Mixed, default: null },
  recalled:   { type: Boolean, default: false },
  recalledAt: { type: Date, default: null },
}, { timestamps: true });

messageSchema.index({ user: 1, unread: 1 });
messageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
