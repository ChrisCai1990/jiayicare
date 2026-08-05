const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true }, // 所属机构（多租户隔离键，创建时从 user.tenantId 冗余存一份）
  serviceId:   { type: String, required: true },
  serviceName: { type: String, required: true },
  servicePrice:{ type: Number }, // 订单总价（历史单次服务订单也等于单次价）
  specificationLabel: { type: String, default: '' }, // 下单时规格快照
  unitPrice:    { type: Number, default: 0 },
  totalUnits:   { type: Number, default: 1, min: 1 },
  usedUnits:    { type: Number, default: 0, min: 0 },
  redemptions: [{
    sequence:   { type: Number, required: true },
    redeemedAt:{ type: Date, default: Date.now },
    redeemedBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    note:       { type: String, default: '' },
    serviceItemKey: { type: String, default: '' },
    serviceItemName: { type: String, default: '' },
  }],
  // 购买时快照，后续产品规则调整不影响历史订单。
  serviceItemsSnapshot: [{
    key: { type: String, required: true },
    name: { type: String, required: true },
    units: { type: Number, default: 1, min: 1 },
    usedUnits: { type: Number, default: 0, min: 0 },
    performers: { type: [require('../utils/tenantScope').servicePerformerRoleSchema], default: [] },
  }],
  performanceRuleSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  servicePerformerRolesSnapshot: { type: [require('../utils/tenantScope').servicePerformerRoleSchema], default: [] },
  serviceIcon: { type: String },
  note:        { type: String, default: '' },
  orderType:   { type: String, enum: ['service', 'package', 'product'], default: 'service' },
  pushRecordId:{ type: mongoose.Schema.Types.ObjectId, ref: 'PushRecord', default: null },
  status: {
    type: String,
    enum: ['pending', 'scheduled', 'completed', 'cancelled'],
    default: 'pending',
  },
  scheduledAt: { type: Date },
  completedAt: { type: Date },

  // ── 真实支付核算（本阶段先支持人工标记已支付，暂不接支付网关，见 backend/CLAUDE.md 待办）──
  paymentMethod: { type: String, enum: ['wechat', 'alipay', 'onsite', 'healthFund', ''], default: '' }, // 微信/支付宝/到店/健康基金抵扣
  paymentStatus: { type: String, enum: ['unpaid', 'pending', 'paid', 'failed', 'refunded'], default: 'unpaid' },
  paidAmount:    { type: Number, default: 0 },   // 实付金额（区别于 servicePrice 标价）
  paymentExpectedAmount: { type: Number, default: 0 },
  paymentOutTradeNo: { type: String, default: '', index: true },
  paymentProductId: { type: String, default: '' },
  paymentEnvironment: { type: String, enum: ['', 'sandbox', 'production'], default: '' },
  paymentClientConfirmedAt: { type: Date, default: null },
  healthFundAmount: { type: Number, default: 0 },
  healthFundEnterpriseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enterprise', default: null },
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
  couponDiscount: { type: Number, default: 0 },
  transactionId: { type: String, default: '' },  // 支付流水号（人工标记时可留空，接入网关后由回调写入）
  paidAt:        { type: Date, default: null },
  paidBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 人工标记已支付的操作人（网关自动确认时为 null）

  // ── 到店核销 ──
  verifyCode:  { type: String, default: '' },   // 核销码（支付确认后生成，唯一）
  verifiedAt:  { type: Date, default: null },
  verifiedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 核销操作人

  // ── 绩效归属（供佣金自动结算使用，谁引流/谁服务）──
  referrerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 转介绍人（引流下单）
  fulfillerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }, // 服务人（实际提供服务，单服务人场景）
  // 多服务岗位归属：产品由多岗位协同服务时，每个岗位对应的具体服务人。结算时按产品 servicePerformerRoles
  // 里各岗位的比例，为这里指定的人各生成一条绩效记录。为空则退回 referrer/fulfiller 单服务人逻辑。
  servicePerformers: [{
    role:    { type: String },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  }],
  commissionStatus: { type: String, enum: ['none', 'pending', 'settled'], default: 'none' }, // 绩效结算状态：无归属/待结算/已结算
}, { timestamps: true });

orderSchema.index({ user: 1, createdAt: -1 });

orderSchema.plugin(require('../utils/tenantScope').tenantScopePlugin);

module.exports = mongoose.model('Order', orderSchema);
