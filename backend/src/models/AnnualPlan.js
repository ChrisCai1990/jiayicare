const mongoose = require('mongoose');

// 年度管理方案 — 每个会员每年一份，医护端配置
const annualPlanSchema = new mongoose.Schema({
  patientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planType:   { type: String, enum: ['health_reshape', 'young_state', 'chronic_stable', 'health_prevention'] },
  year:       { type: Number, default: () => new Date().getFullYear() },
  moduleData: { type: mongoose.Schema.Types.Mixed, default: {} }, // { moduleKey: { enabled, field1, field2... } }
  notes:      { type: String, default: '' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

// 同一会员同一年度只有一份（upsert）
annualPlanSchema.index({ patientId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('AnnualPlan', annualPlanSchema);
