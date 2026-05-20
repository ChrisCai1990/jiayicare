const mongoose = require('mongoose');

const checkupItemSchema = new mongoose.Schema({
  name:       { type: String, required: true },  // 如：心脏彩超、血常规
  targetDate: { type: String, default: '' },      // YYYY-MM
  note:       { type: String, default: '' },
  status:     { type: String, enum: ['pending', 'done', 'overdue'], default: 'pending' },
  reportId:   { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport', default: null },
}, { _id: true });

const checkupPlanSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year:     { type: Number, required: true },
  title:    { type: String, default: '' },   // 如：2025年度复查计划
  note:     { type: String, default: '' },
  items:    [checkupItemSchema],
  createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

module.exports = mongoose.model('CheckupPlan', checkupPlanSchema);
