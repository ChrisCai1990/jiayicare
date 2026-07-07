const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  tenantId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键，各机构各自维护自己的定价库）
  name:          { type: String, required: true },
  subtitle:      { type: String, default: '' },
  images:        [{ type: String }],
  originalPrice: { type: Number, required: true },
  servicePrices: [{ label: { type: String }, price: { type: Number } }],
  memberPrices:  { type: mongoose.Schema.Types.Mixed, default: {} },
  category:      { type: String, required: true },
  sortOrder:     { type: Number, default: 999 },
  features:      [{ type: String }],
  description:   { type: String, default: '' },
  stock:         { type: Number, default: 0 },
  sales:         { type: Number, default: 0 },
  status:        { type: String, enum: ['on', 'off'], default: 'off' },
  // 绩效分配规则（字段先占位，识别"谁是引流人/谁是服务人"的具体逻辑和自动分配触发链路待设计后再接入）
  performanceRule: require('../utils/tenantScope').performanceRuleSchema,
}, { timestamps: true });

productSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('Product', productSchema);
