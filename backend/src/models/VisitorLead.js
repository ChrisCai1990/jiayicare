const mongoose = require('mongoose');

// 官网访客与已注册会员分开存放。此处只承接明确同意后的非医疗咨询信息，
// 不保存病历、检查指标、症状、用药和完整对话记录。
const visitorLeadSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 30 },
  phone: { type: String, required: true, maxlength: 20, index: true },
  city: { type: String, default: '', maxlength: 40 },
  contactWindow: { type: String, default: '', maxlength: 60 },
  topic: { type: String, default: '', maxlength: 60 },
  summary: { type: String, default: '', maxlength: 500 },
  source: { type: String, default: 'website_ai', maxlength: 40 },
  consentAt: { type: Date, required: true },
  status: { type: String, enum: ['new', 'contacted', 'closed'], default: 'new', index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  contactNote: { type: String, default: '', maxlength: 500 },
  contactedAt: { type: Date, default: null },
}, { timestamps: true });

visitorLeadSchema.index({ createdAt: -1 });
// 未转化的官网线索不应无限保存；到期由 MongoDB 自动删除。
visitorLeadSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model('VisitorLead', visitorLeadSchema);
