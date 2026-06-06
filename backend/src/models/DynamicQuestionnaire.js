const mongoose = require('mongoose');

// 选项结构（兼容旧版纯字符串——label 不设 required，防止旧数据迁移时校验失败）
const optionSchema = new mongoose.Schema({
  label:      { type: String, default: '' },
  allowInput: { type: Boolean, default: false }, // 选中后可附加文本
  exclusive:  { type: Boolean, default: false }, // 互斥（选此项则取消其他）
  score:      { type: Number,  default: 0 },     // 该选项得分
}, { _id: false });

// 跳题逻辑规则
const jumpRuleSchema = new mongoose.Schema({
  condition: { type: String }, // 触发条件（选项label）
  jumpTo:    { type: String }, // 跳转目标题目id
}, { _id: false });

const questionSchema = new mongoose.Schema({
  id:      { type: String, required: true },
  type:    { type: String, enum: ['radio','multi','dropdown','scale','matrix','text','number','date'], required: true },
  text:    { type: String, required: true },
  options: [optionSchema],      // radio / multi / dropdown（对象选项）
  rows:    [{ type: String }],  // matrix 行
  cols:    [{ type: String }],  // matrix 列
  min:     { type: Number },
  max:     { type: Number },
  minLabel:{ type: String },
  maxLabel:{ type: String },
  placeholder: { type: String },
  required:    { type: Boolean, default: true },
  jumpLogic:   [jumpRuleSchema],   // 跳题逻辑
  scoreEnabled:{ type: Boolean, default: false }, // 本题是否参与评分
}, { _id: false });

const questionnaireSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  questions:   [questionSchema],
  status:      { type: String, enum: ['draft', 'active', 'closed'], default: 'draft' },
  targetType:  { type: String, enum: ['all', 'specific'], default: 'all' },
  targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  respondedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  deadline:    { type: String, default: '' },
  sortOrder:   { type: Number, default: 0 },        // 问卷排序
  scoringEnabled: { type: Boolean, default: false }, // 启用评分
  scoreRanges: [{                                    // 分值段含义（需求19）
    minScore:    { type: Number, required: true },
    maxScore:    { type: Number, required: true },
    label:       { type: String, default: '' },   // 如：健康风险高
    description: { type: String, default: '' },   // 如：需要专业干预
    _id: false,
  }],
}, { timestamps: true });

// 答卷记录
const questionnaireResponseSchema = new mongoose.Schema({
  questionnaire: { type: mongoose.Schema.Types.ObjectId, ref: 'DynamicQuestionnaire', required: true },
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  answers:       { type: mongoose.Schema.Types.Mixed, default: {} },
  totalScore:    { type: Number, default: 0 }, // 自动计算总分
  submittedAt:   { type: Date, default: Date.now },
}, { timestamps: true });

const DynamicQuestionnaire = mongoose.model('DynamicQuestionnaire', questionnaireSchema);
const QuestionnaireResponse = mongoose.model('QuestionnaireResponse', questionnaireResponseSchema);

module.exports = { DynamicQuestionnaire, QuestionnaireResponse };
