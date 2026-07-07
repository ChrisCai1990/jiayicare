const mongoose = require('mongoose');

// 其他收费（如"挂号费""材料费"）
const otherChargeSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键）
  name:        { type: String, required: true, trim: true },
  mnemonic:    { type: String, default: '', trim: true },
  costPrice:   { type: Number, default: 0 },
  retailPrice: { type: Number, default: 0 },
  unit:                   { type: String, default: '次' },
  participatesInDiscount: { type: Boolean, default: true },
  remark:                 { type: String, default: '' },
  categoryId:             { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectCategory', default: null },
  status:                 { type: String, enum: ['active', 'inactive'], default: 'active' },
  // 绩效分配规则（字段先占位，识别"谁是引流人/谁是服务人"的具体逻辑和自动分配触发链路待设计后再接入）
  performanceRule: require('../utils/tenantScope').performanceRuleSchema,
}, { timestamps: true });

otherChargeSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('OtherCharge', otherChargeSchema);
