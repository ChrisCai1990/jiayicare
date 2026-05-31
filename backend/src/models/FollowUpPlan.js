const mongoose = require('mongoose');

// 随访方案模板（预定义的随访计划）
const cycleItemSchema = new mongoose.Schema({
  cycleType:     { type: String, enum: ['duration', 'date'], default: 'duration' },
  cycleDuration: { type: Number, default: 30 },
  cycleUnit:     { type: String, enum: ['day', 'week', 'month'], default: 'day' },
  cycleDate:     { type: Date, default: null },
  notes:         { type: String, default: '' },
}, { _id: false });

const followUpPlanSchema = new mongoose.Schema({
  name:              { type: String, required: true, trim: true },
  formId:            { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUpForm', default: null },
  cycles:            { type: [cycleItemSchema], default: [{ cycleType: 'duration', cycleDuration: 30, cycleUnit: 'day', notes: '' }] },
  defaultRole:       { type: String, default: '' },
  defaultEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  default_content:   { type: mongoose.Schema.Types.Mixed, default: {} },
  status:            { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('FollowUpPlan', followUpPlanSchema);
