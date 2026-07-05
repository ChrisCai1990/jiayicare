const mongoose = require('mongoose');

// 心理健康标准量表评估（PHQ-9抑郁/GAD-7焦虑等），题目/评分规则固定，需保留逐题作答供家庭医师查看
const psychAssessmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scaleType: { type: String, enum: ['phq9', 'gad7'], required: true }, // 量表类型：phq9=抑郁症筛查量表，gad7=广泛性焦虑量表
  answers: [{
    question: { type: String, required: true }, // 题干原文
    score:    { type: Number, required: true },  // 该题得分（0-3）
  }],
  totalScore: { type: Number, required: true },
  severity:   { type: String, required: true }, // 严重程度分级（无/轻度/中度/中重度/重度，按量表标准区间划分）
  filledAt:   { type: Date, default: Date.now },
  staffId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 代填时记录操作人，患者自填为null
}, { timestamps: true });

psychAssessmentSchema.index({ patientId: 1, scaleType: 1, filledAt: -1 });

module.exports = mongoose.model('PsychAssessment', psychAssessmentSchema);
