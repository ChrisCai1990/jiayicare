const mongoose = require('mongoose');

// 随访方案模板（预定义的随访计划）
const followUpPlanSchema = new mongoose.Schema({
  name:            { type: String, required: true, trim: true },
  formId:          { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUpForm', default: null },
  cycleDuration:   { type: Number, default: 30 }, // 数值
  cycleUnit:       { type: String, enum: ['day', 'week', 'month'], default: 'day' },
  defaultRole:     { type: String, default: '' }, // 如"健管专员"
  notes:           { type: String, default: '' }, // 方案备注
  status:          { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('FollowUpPlan', followUpPlanSchema);
