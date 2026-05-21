const mongoose = require('mongoose');

const knowledgeItemSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  title:     { type: String, required: true },
  category: {
    type: String,
    enum: ['diet', 'exercise', 'sleep', 'checkup', 'medication', 'service_flow', 'home_monitor', 'other'],
    default: 'other',
  },
  tags:      { type: [String], default: [] },
  content:   { type: String, default: '' },   // 文章正文或图文说明
  fileUrl:   { type: String, default: '' },   // 附件（PDF/图片）URL
  fileType:  { type: String, enum: ['image', 'pdf', 'text', ''], default: '' },
  coverUrl:  { type: String, default: '' },   // 封面图
  isPublic:  { type: Boolean, default: true }, // 全员可用
}, { timestamps: true });

module.exports = mongoose.model('KnowledgeItem', knowledgeItemSchema);
