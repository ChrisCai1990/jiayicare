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
  // 绩效分配规则（引流人+单一服务人两个比例，历史结构，保留兼容）
  performanceRule: require('../utils/tenantScope').performanceRuleSchema,
  // 多服务岗位绩效：一个产品由多个岗位协同提供服务，每岗位各自的绩效比例（占实付价%）。
  // 具体是哪个人由推送/核销时按岗位指定。为空数组时退回 performanceRule 单服务人逻辑。
  servicePerformerRoles: { type: [require('../utils/tenantScope').servicePerformerRoleSchema], default: [] },
}, { timestamps: true });

productSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('Product', productSchema);
