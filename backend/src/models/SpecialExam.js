const mongoose = require('mongoose');

// 特殊检查项目（超声、影像、内镜、磁共振等）
const specialExamSchema = new mongoose.Schema({
  tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键）
  name:           { type: String, required: true, trim: true },
  mnemonic:       { type: String, default: '', trim: true },
  examType:               { type: String, enum: ['ultrasound', 'radiology', 'mri', 'endoscopy', 'pathology', 'other'], default: 'other' },
  bodyPart:               { type: String, default: '' },
  costPrice:              { type: Number, default: 0 },
  retailPrice:            { type: Number, default: 0 },
  unit:                   { type: String, default: '次' },
  participatesInDiscount: { type: Boolean, default: true },
  referenceRange:         { type: String, default: '' },
  description:            { type: String, default: '' },
  conclusion:             { type: String, default: '' },
  categoryId:             { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:                 { type: String, enum: ['active', 'inactive'], default: 'active' },
  sortOrder:              { type: Number, default: 0 },
  deleted:                { type: Boolean, default: false },
  // 绩效分配规则（字段先占位，识别"谁是引流人/谁是服务人"的具体逻辑和自动分配触发链路待设计后再接入）
  performanceRule: require('../utils/tenantScope').performanceRuleSchema,
}, { timestamps: true });

specialExamSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('SpecialExam', specialExamSchema);
