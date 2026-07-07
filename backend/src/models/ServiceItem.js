const mongoose = require('mongoose');

// 服务项目（非检验类，如"专家咨询""陪诊"）
const serviceItemSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键）
  name:        { type: String, required: true, trim: true },
  mnemonic:    { type: String, default: '', trim: true },
  costPrice:   { type: Number, default: 0 },
  retailPrice: { type: Number, default: 0 },
  unit:                   { type: String, default: '次' },
  duration:               { type: Number, default: 0 }, // 保留旧字段
  participatesInDiscount: { type: Boolean, default: true },
  categoryId:             { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
  // 绩效分配规则（字段先占位，识别"谁是引流人/谁是服务人"的具体逻辑和自动分配触发链路待设计后再接入）
  performanceRule: require('../utils/tenantScope').performanceRuleSchema,
}, { timestamps: true });

serviceItemSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('ServiceItem', serviceItemSchema);
