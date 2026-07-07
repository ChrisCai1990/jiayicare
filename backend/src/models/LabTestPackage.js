const mongoose = require('mongoose');

// 专项检查套餐（一组检验项目和/或检查医嘱的集合）
const labTestPackageSchema = new mongoose.Schema({
  tenantId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键）
  name:          { type: String, required: true, trim: true },
  mnemonic:      { type: String, default: '', trim: true },
  remark:        { type: String, default: '' },
  labTestItems:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabTestItem' }],  // 关联检验项目
  specialExams:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'SpecialExam' }],          // 关联检查医嘱
  functionalTests:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'FunctionalMedicineTest' }], // 关联功能医学检测
  orders:            [{ type: mongoose.Schema.Types.ObjectId, ref: 'LabTestOrder' }],           // 兼容旧数据
  categoryId:    { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:        { type: String, enum: ['active', 'inactive'], default: 'active' },
  // 绩效分配规则（字段先占位，识别"谁是引流人/谁是服务人"的具体逻辑和自动分配触发链路待设计后再接入）
  performanceRule: require('../utils/tenantScope').performanceRuleSchema,
}, { timestamps: true });

labTestPackageSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('LabTestPackage', labTestPackageSchema);
