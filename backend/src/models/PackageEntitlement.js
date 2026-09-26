const mongoose = require('mongoose');

// 已支付服务包的可用权益台账。模板和订单快照是“当时卖了什么”，本表才是
// 使用过程中会变化的剩余次数与使用记录；一笔服务包订单只会生成一条台账。
const packageEntitlementSchema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  sourceOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicePackage', default: null },
  packageName: { type: String, default: '' },
  clientBrand: { type: String, enum: ['jiayiguanjia', 'jinyisen'], default: 'jiayiguanjia' },
  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true, index: true },
  status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active', index: true },
  familySharing: { type: Boolean, default: false },
  rights: { type: mongoose.Schema.Types.Mixed, default: {} },
  usageRecords: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, default: '' },
    poolKey: { type: String, default: '' },
    usedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    executionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    usedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  }],
}, { timestamps: true });

packageEntitlementSchema.index({ ownerUserId: 1, status: 1, validUntil: 1 });

module.exports = mongoose.model('PackageEntitlement', packageEntitlementSchema);
