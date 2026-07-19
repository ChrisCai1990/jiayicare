const mongoose = require('mongoose');

// 首页「健康团队今日动态」：每晚批量为活跃用户生成，次日首页直接读现成结果。
// 按用户+日期唯一，重复生成会先删旧的再写新的（见 dailyTeamInsight.js）。
const dailyTeamInsightSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true }, // YYYY-MM-DD，对应"今天"展示的是哪一天生成的内容
  doctor:       { type: String, default: '' }, // 家庭医生：医疗风险提示
  nutritionist: { type: String, default: '' }, // 营养师：饮食建议
  healthManager:{ type: String, default: '' }, // 健康管理师：跟进内容
  aiSummary:    { type: String, default: '' }, // AI健康分析摘要
  todaySuggestion: { type: String, default: '' }, // 今日建议
  generatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

dailyTeamInsightSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyTeamInsight', dailyTeamInsightSchema);
