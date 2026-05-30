const mongoose = require('mongoose');

const annualPlanTemplateSchema = new mongoose.Schema({
  name:       { type: String, default: '年度管理方案模板' },
  planType:   { type: String, enum: ['health_reshape', 'young_state', 'chronic_stable', 'health_prevention'] },
  year:       { type: Number, default: () => new Date().getFullYear() },
  moduleData: { type: mongoose.Schema.Types.Mixed, default: {} },
  notes:      { type: String, default: '' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

module.exports = mongoose.model('AnnualPlanTemplate', annualPlanTemplateSchema);
