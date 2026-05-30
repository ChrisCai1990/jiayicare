const mongoose = require('mongoose');

// 随访方案模板（预定义的随访计划）
const followUpPlanSchema = new mongoose.Schema({
  name:              { type: String, required: true, trim: true },
  formId:            { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUpForm', default: null },
  cycleType:         { type: String, enum: ['duration', 'date'], default: 'duration' },
  cycleDuration:     { type: Number, default: 30 },
  cycleUnit:         { type: String, enum: ['day', 'week', 'month'], default: 'day' },
  cycleDate:         { type: Date, default: null },
  defaultRole:       { type: String, default: '' },
  defaultEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  notes:             { type: String, default: '' },
  status:            { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('FollowUpPlan', followUpPlanSchema);
