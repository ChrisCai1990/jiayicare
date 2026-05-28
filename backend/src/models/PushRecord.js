const mongoose = require('mongoose');

// 统一推送记录：科普/方案/问卷/注意事项等推送给患者的记录
const pushRecordSchema = new mongoose.Schema({
  staffId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  patientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  type: {
    type: String,
    enum: ['knowledge', 'plan', 'questionnaire', 'supplement', 'product', 'notice'],
    required: true,
  },
  // 关联资源（可选）
  knowledgeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeItem', default: null },
  planId:          { type: mongoose.Schema.Types.ObjectId, ref: 'HealthPlan',    default: null },
  questionnaireId: { type: mongoose.Schema.Types.ObjectId, ref: 'DynamicQuestionnaire', default: null },
  // 内容摘要（用于列表展示）
  title:   { type: String, default: '' },
  content: { type: String, default: '' },
  // 产品推送附加信息（单品兼容字段）
  price:     { type: Number, default: null },
  productId: { type: String, default: null },
  // 多产品组合推送
  products: [{
    productId: { type: String },
    name:      { type: String },
    price:     { type: Number },
    category:  { type: String },
    icon:      { type: String, default: '🛍' },
  }],
  // 阅读状态
  readAt: { type: Date, default: null },
}, { timestamps: true });

pushRecordSchema.index({ patientId: 1, createdAt: -1 });
pushRecordSchema.index({ staffId: 1, createdAt: -1 });

module.exports = mongoose.model('PushRecord', pushRecordSchema);
