const mongoose = require('mongoose');

// 问题配置（与前端 QuestionnaireScreen QUESTIONS 格式兼容）
const questionSchema = new mongoose.Schema({
  id:      { type: String, required: true },
  type:    { type: String, enum: ['radio','multi','dropdown','scale','matrix','text','number','date'], required: true },
  text:    { type: String, required: true },
  options: [{ type: String }],        // radio / multi 选项
  rows:    [{ type: String }],        // matrix 行
  cols:    [{ type: String }],        // matrix 列
  min:     { type: Number },
  max:     { type: Number },
  minLabel:{ type: String },
  maxLabel:{ type: String },
  placeholder: { type: String },
  required: { type: Boolean, default: true },
}, { _id: false });

const questionnaireSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  questions:   [questionSchema],
  status:      { type: String, enum: ['draft', 'active', 'closed'], default: 'draft' },
  // 推送目标：all=全体用户，specific=指定用户
  targetType:  { type: String, enum: ['all', 'specific'], default: 'all' },
  targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // 已答题用户
  respondedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  deadline:    { type: String, default: '' },
}, { timestamps: true });

// 答卷记录
const questionnaireResponseSchema = new mongoose.Schema({
  questionnaire: { type: mongoose.Schema.Types.ObjectId, ref: 'DynamicQuestionnaire', required: true },
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  answers:       { type: mongoose.Schema.Types.Mixed, default: {} },
  submittedAt:   { type: Date, default: Date.now },
}, { timestamps: true });

const DynamicQuestionnaire = mongoose.model('DynamicQuestionnaire', questionnaireSchema);
const QuestionnaireResponse = mongoose.model('QuestionnaireResponse', questionnaireResponseSchema);

module.exports = { DynamicQuestionnaire, QuestionnaireResponse };
