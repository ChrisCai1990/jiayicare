const mongoose = require('mongoose');

const functionalMedicineTestSchema = new mongoose.Schema({
  tenantId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键）
  name:               { type: String, required: true, trim: true },
  testResult:         { type: String, default: '' },  // 检测结果（描述/模板）
  indicatorAnalysis:  { type: String, default: '' },  // 指标分析
  managementAdvice:   { type: String, default: '' },  // 管理建议
  testTiming:         { type: String, default: '' },  // 检测时间
  institution:        { type: String, default: '' },  // 检测机构
  categoryId:         { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null, set: v => (v ? v : null) }, // 前端未选分类时传空字符串，空串守卫避免 Cast to ObjectId 报错
  status:             { type: String, enum: ['active', 'inactive'], default: 'active' },
  deleted:            { type: Boolean, default: false },
}, { timestamps: true });

functionalMedicineTestSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('FunctionalMedicineTest', functionalMedicineTestSchema);
