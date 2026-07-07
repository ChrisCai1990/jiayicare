const mongoose = require('mongoose');

const planTemplateSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键）
  type: {
    type: String,
    required: true,
    enum: ['annual_checkup', 'health_management', 'nutrition', 'medical_assist', 'rehab', 'tcm', 'psychology'],
  },
  name:    { type: String, required: true },
  status:  { type: String, enum: ['active', 'inactive'], default: 'active' },
  content: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

planTemplateSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('PlanTemplate', planTemplateSchema);
