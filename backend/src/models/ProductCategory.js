const mongoose = require('mongoose');

const productCategorySchema = new mongoose.Schema({
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键）
  name:      { type: String, required: true }, // 原为全局unique，改为 tenantId+name 联合唯一，见下方索引
  sortOrder: { type: Number, default: 999 },
}, { timestamps: true });

productCategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

productCategorySchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('ProductCategory', productCategorySchema);
