const mongoose = require('mongoose');

// 已支付服务包的可用权益台账。模板和订单快照是“当时卖了什么”，本表才是
// 使用过程中会变化的剩余次数与使用记录；一笔服务包订单只会生成一条台账。
const packageEntitlementSchema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  sourceOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  // 企业合同授予的权益没有商城订单；用企业+成员+服务包作为可追溯来源，
  // sourceOrderId 仍保留一个内部幂等标识，以兼容既有订单台账索引。
  sourceType: { type: String, enum: ['order', 'enterprise_contract', 'effective_service'], default: 'order', index: true },
  sourceEnterpriseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enterprise', default: null, index: true },
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicePackage', default: null },
  packageName: { type: String, default: '' },
  clientBrand: { type: String, enum: ['jiayiguanjia', 'jinyisen'], default: 'jiayiguanjia' },
  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true, index: true },
  status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active', index: true },
  familySharing: { type: Boolean, default: false },
  historyVerified: { type: Boolean, default: true }, // 历史生效服务包没有核销台账时，不宣称剩余次数准确
  rights: { type: mongoose.Schema.Types.Mixed, default: {} },
  usageRecords: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, default: '' },
    poolKey: { type: String, default: '' },
    usedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    executionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    sourceKey: { type: String, default: '' },
    sourceType: { type: String, default: '' },
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: ['reserved', 'redeemed', 'cancelled'], default: 'redeemed' },
    usedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  }],
}, { timestamps: true });

packageEntitlementSchema.index({ ownerUserId: 1, status: 1, validUntil: 1 });

module.exports = mongoose.model('PackageEntitlement', packageEntitlementSchema);
