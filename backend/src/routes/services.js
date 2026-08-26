const express = require('express');
const mongoose = require('mongoose');
const router  = express.Router();
const auth    = require('../middleware/auth');
const Order   = require('../models/Order');
const Service = require('../models/Service');
const PushRecord = require('../models/PushRecord');
const User    = require('../models/User');
const Coupon  = require('../models/Coupon');
const FollowUp = require('../models/FollowUp');
const Admin   = require('../models/Admin');
const ServicePackage = require('../models/ServicePackage');
const { awardOrderPoints } = require('../utils/orderPoints');
const Payment = require('../models/Payment');
const wechatPay = require('../utils/wechatPay');
const Fulfillment = require('../models/Fulfillment');
const ServiceInquiry = require('../models/ServiceInquiry');
const ProductShare = require('../models/ProductShare');
const crypto = require('crypto');

const Product = require('../models/Product');
const ProductCategory = require('../models/ProductCategory');
const { resolveHealthPlanner } = require('../utils/healthPlannerAssignment');

// GET /api/services — 从商城产品获取（管理员在后台维护的 Products）
// Public catalogue: reviewers and prospective users must be able to browse
// service content before being asked to log in or authorize personal data.
router.get('/', async (req, res) => {
  const [products, categoryDocs] = await Promise.all([
    Product.find({ status: 'on' }).sort({ sortOrder: 1, createdAt: 1 }),
    ProductCategory.find().sort({ sortOrder: 1, createdAt: 1 }).lean(),
  ]);

  const productCountByCategory = products.reduce((counts, product) => {
    const name = String(product.category || '').trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
    return counts;
  }, new Map());
  const categoryNodes = categoryDocs.map(category => ({
    id: String(category._id), name: category.name,
    parentId: category.parent ? String(category.parent) : null,
    productCount: productCountByCategory.get(category.name) || 0,
    children: [],
  }));
  const categoryById = new Map(categoryNodes.map(category => [category.id, category]));
  const categoryTree = [];
  categoryNodes.forEach(category => {
    const parent = category.parentId && categoryById.get(category.parentId);
    if (parent) parent.children.push(category);
    else categoryTree.push(category);
  });
  const configuredNames = new Set(categoryNodes.map(category => category.name));
  productCountByCategory.forEach((productCount, name) => {
    if (!configuredNames.has(name)) categoryTree.push({ id: `legacy:${name}`, name, parentId: null, productCount, children: [] });
  });
  categoryTree.forEach(category => {
    category.totalProductCount = category.productCount + category.children.reduce((sum, child) => sum + child.productCount, 0);
  });

  // 商品只以管理后台上架数据为准，不使用演示目录兜底。
  if (products.length === 0) {
    return res.json({ success: true, data: { categories: ['全部'], categoryTree, services: [] } });
  }

  const categories = ['全部', ...categoryTree.flatMap(category => [category.name, ...category.children.map(child => child.name)])];
  const services = products.map(p => {
    const firstPrice = p.servicePrices?.[0];
    return {
      id: p._id.toString(),
      category: p.category,
      name: p.name,
      subtitle: p.subtitle || '',
      price: firstPrice ? firstPrice.price : p.originalPrice,
      originalPrice: p.originalPrice,
      rating: 5.0,
      reviewCount: p.sales || 0,
      tag: '',
      tagColor: '',
      icon: 'storefront-outline',
      iconColor: '#1E6B50',
      features: p.features || [],
      images: p.images || [],
      servicePrices: p.servicePrices || [],
      description: p.description || '',
      fulfillmentType: p.fulfillmentType || 'offline_service',
      paymentChannel: p.paymentChannel || 'wechat_pay',
      bookingRequired: p.bookingRequired !== false,
      deliveryRequired: !!p.deliveryRequired,
      serviceLocation: p.serviceLocation || '',
      validityDays: p.validityDays || 365,
      refundPolicy: p.refundPolicy || '',
      healthFundDeduction: p.healthFundDeduction || { mode:'inherit', value:0 },
      skus: p.skus || [],
    };
  });

  res.json({ success: true, data: { categories, categoryTree, services } });
});

// GET /api/services/coupons — 当前用户可用的优惠券
router.get('/coupons', auth, async (req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    patientId: req.user._id,
    status: 'active',
    $and: [{ $or: [{ validFrom: null }, { validFrom: { $lte: now } }] }],
    $or: [{ validTo: null }, { validTo: { $gte: now } }],
  }).sort({ createdAt: -1 });
  res.json({ success: true, data: coupons });
});

// Product-only sharing. A token identifies the sharer without exposing user ids in the URL.
router.post('/product-shares', auth, async (req, res) => {
  const product = await Product.findOne({ _id: req.body.productId, status: 'on' }).select('_id name images');
  if (!product) return res.status(404).json({ success: false, message: '产品不存在或已下架' });
  const share = await ProductShare.create({
    token: crypto.randomBytes(18).toString('base64url'),
    productId: product._id,
    sharerType: 'customer',
    sharerUserId: req.user._id,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  res.json({ success: true, data: { token: share.token, productId: String(product._id), title: product.name, imageUrl: product.images?.[0] || '' } });
});

router.post('/product-shares/:token/claim', auth, async (req, res) => {
  const share = await ProductShare.findOne({ token: req.params.token, expiresAt: { $gt: new Date() } });
  if (!share) return res.status(404).json({ success: false, message: '分享链接已失效' });
  if (share.sharerUserId && String(share.sharerUserId) === String(req.user._id)) {
    return res.json({ success: true, data: { productId: String(share.productId), selfShare: true } });
  }
  if (share.recipientUserId && String(share.recipientUserId) !== String(req.user._id)) {
    return res.status(409).json({ success: false, message: '该分享关系已由其他客户确认' });
  }
  share.recipientUserId = req.user._id;
  share.openedAt ||= new Date();
  share.claimedAt ||= new Date();
  await share.save();
  res.json({ success: true, data: { productId: String(share.productId), selfShare: false } });
});

// 新客户可自主开通的服务包，展示内容完全由 Admin 维护。
router.get('/packages', auth, async (req, res) => {
  const user = await User.findById(req.user._id).select('clientBrand').lean();
  const clientBrand = user?.clientBrand || 'jiayiguanjia';
  const list = await ServicePackage.find({ clientBrand, active: true, 'activation.enabled': true })
    .sort({ 'activation.highlight': -1, sortOrder: 1, createdAt: 1 }).lean();
  res.json({ success: true, data: list.map(item => ({
    id: String(item._id), name: item.name,
    durationMonths: item.activation?.durationMonths || 12,
    duration: `${item.activation?.durationMonths || 12} 个月`,
    price: Number(item.activation?.price || 0),
    originalPrice: Number(item.activation?.originalPrice || item.activation?.price || 0),
    features: item.activation?.features || [], tag: item.activation?.tag || '',
    highlight: !!item.activation?.highlight,
  })) });
});

// ── 服务包目录（首次开通 & 续费使用）────────────────────────────
const PACKAGE_CATALOG = [
  { id: 'pkg_1y', name: '年度服务包', duration: '12 个月', price: 3650, originalPrice: 5000, icon: 'shield-checkmark', category: '服务包' },
  { id: 'pkg_6m', name: '半年服务包', duration: '6 个月',  price: 1980, originalPrice: 2800, icon: 'shield-checkmark', category: '服务包' },
  { id: 'pkg_3m', name: '季度服务包', duration: '3 个月',  price: 1080, originalPrice: 1480, icon: 'shield-checkmark', category: '服务包' },
];

router.post('/inquiries', auth, async (req, res) => {
  const product = await Product.findOne({ _id: req.body.serviceId, status: 'on' });
  if (!product) return res.status(404).json({ success: false, message: '服务项目不存在或已下架' });
  const inquiry = await ServiceInquiry.create({
    user: req.user._id,
    product: product._id,
    specificationLabel: String(req.body.specificationLabel || ''),
    note: String(req.body.note || '').trim(),
  });
  const patient = await User.findById(req.user._id).select('assignedHealthPlanner');
  if (patient?.assignedHealthPlanner) {
    await FollowUp.create({
      staffId: patient.assignedHealthPlanner, assignedTo: patient.assignedHealthPlanner,
      patientId: req.user._id, type: 'other', status: 'planned',
      theme: `服务咨询：${product.name}`,
      content: [req.body.specificationLabel, req.body.note].filter(Boolean).join('；') || '用户希望咨询该服务',
      sourceType: 'other',
    });
  }
  res.json({ success: true, data: inquiry, message: '咨询已提交，健管师将尽快联系您' });
});

// POST /api/services/order — 提交服务预约（支持单项服务 & 服务包）
// useHealthFund: 本次要抵扣的健康基金金额（元，<= 余额 且 <= 订单原价）
// couponId: 本次要使用的优惠券 _id（amount 满减 或 percent 折扣，两者可叠加使用）
router.post('/order', auth, async (req, res) => {
  const { serviceId, specificationLabel, note, paymentMethod = 'wechat_pay', useHealthFund, couponId, shareToken = '' } = req.body;
  if (!serviceId) {
    return res.status(400).json({ success: false, message: '请指定服务项目' });
  }

  // 先从 Product / Admin 服务包查，再查 Service，最后兼容旧版静态 ID
  let service = null;
  let servicePackage = null;
  const product = await Product.findById(serviceId).catch(() => null);
  if (product) {
    const prices = product.servicePrices || [];
    const activeSkus = (product.skus || []).filter(item => item.active !== false);
    const selectedSku = specificationLabel
      ? activeSkus.find(item => item.label === specificationLabel)
      : activeSkus[0];
    const selectedPrice = specificationLabel
      ? prices.find(item => item.label === specificationLabel)
      : prices[0];
    if (specificationLabel && !selectedSku && !selectedPrice) {
      return res.status(400).json({ success: false, message: '所选服务规格已调整，请刷新后重新选择' });
    }
    service = {
      id: product._id.toString(),
      name: product.name,
      // 商城展示和后台日常改价都以“收费项目”servicePrices 为准；SKU
      // 只补充次数、有效期等履约信息，不能用残留旧价覆盖页面显示价。
      price: selectedPrice ? selectedPrice.price : (selectedSku ? selectedSku.price : product.originalPrice),
      specificationLabel: selectedSku?.label || selectedPrice?.label || '',
      skuCode: selectedSku?.code || '',
      skuTotalUnits: selectedSku?.totalUnits || 0,
      skuValidityDays: selectedSku?.validityDays || product.validityDays || 365,
      skuFulfillmentType: selectedSku?.fulfillmentType || '',
      category: product.category || '',
      icon: 'storefront-outline',
      fulfillmentType: product.fulfillmentType || 'offline_service',
      paymentChannel: product.paymentChannel || 'wechat_pay',
    };
  }
  if (!service && mongoose.isValidObjectId(serviceId)) {
    servicePackage = await ServicePackage.findOne({
      _id: serviceId,
      clientBrand: req.user.clientBrand || 'jiayiguanjia',
      active: true,
      'activation.enabled': true,
    }).lean();
    if (servicePackage) {
      const a = servicePackage.activation || {};
      service = { id: String(servicePackage._id), name: servicePackage.name, price: Number(a.price || 0),
        originalPrice: Number(a.originalPrice || a.price || 0), duration: `${a.durationMonths || 12} 个月`,
        category: '服务包', icon: 'shield-checkmark' };
    }
  }
  if (!service) {
    const dbSvc = await Service.findOne({ serviceId });
    if (dbSvc) service = { id: dbSvc.serviceId, name: dbSvc.name, price: dbSvc.price, icon: dbSvc.icon || 'star-outline' };
  }
  if (!service) service = PACKAGE_CATALOG.find(p => p.id === serviceId);
  if (!service) {
    return res.status(404).json({ success: false, message: '服务项目不存在' });
  }

  const isPkg = !!servicePackage || !!PACKAGE_CATALOG.find(p => p.id === serviceId);
  const unitsMatch = String(service.specificationLabel || '').match(/(\d+)\s*次/);
  const productServiceItems = service.skuCode ? [] : (product?.serviceItems || []).filter(item => item.name && Number(item.units) > 0);
  const totalUnits = service.skuTotalUnits
    ? Math.max(1, Number(service.skuTotalUnits))
    : productServiceItems.length
    ? productServiceItems.reduce((sum, item) => sum + Math.max(1, Number(item.units) || 1), 0)
    : (unitsMatch ? Math.max(1, Number(unitsMatch[1])) : 1);
  const unitPrice = Math.round((service.price / totalUnits) * 100) / 100;

  // ── 健康基金 + 优惠券抵扣（下单即扣，实时校验余额/券状态）──────────
  let coupon = null;
  let couponDiscount = 0;
  const fundPolicy = await require('../utils/healthFundPayment').getHealthFundPolicy();
  if (couponId && useHealthFund > 0 && !fundPolicy.allowCouponStacking) {
    return res.status(400).json({ success:false, message:'健康基金与抵用券不可同时使用，请选择其中一种' });
  }
  if (couponId) {
    coupon = await Coupon.findOne({ _id: couponId, patientId: req.user._id, status: 'active' });
    if (!coupon) {
      return res.status(400).json({ success: false, message: '优惠券不可用或已使用' });
    }
    if (coupon.validTo && new Date(coupon.validTo) < new Date()) {
      return res.status(400).json({ success: false, message: '优惠券已过期' });
    }
    if (coupon.validFrom && new Date(coupon.validFrom) > new Date()) {
      return res.status(400).json({ success: false, message: '优惠券尚未到生效时间' });
    }
    if (coupon.minSpend && service.price < coupon.minSpend) {
      return res.status(400).json({ success: false, message: `订单需满 ¥${coupon.minSpend} 才能使用此券` });
    }
    couponDiscount = coupon.type === 'amount'
      ? coupon.value
      : Math.round(service.price * (100 - coupon.value)) / 100;
    couponDiscount = Math.min(couponDiscount, service.price);
    couponDiscount = Math.min(couponDiscount, require('../utils/healthFundPayment').deductionLimit(fundPolicy.couponDeductionType, fundPolicy.couponDeductionValue, service.price));
  }

  const priceAfterCoupon = Math.max(0, Math.round((service.price - couponDiscount) * 100) / 100);

  let fundUsed = 0;
  let fundEnterprise = null;
  let fundBreakdown = { personal: 0, corporate: 0 };
  if (useHealthFund > 0) {
    try {
      const checked = await require('../utils/healthFundPayment').validateHealthFundDeduction({ user:req.user, requested:useHealthFund, orderAmount:priceAfterCoupon, category:service.category || '', productId: product?._id || serviceId });
      fundUsed = checked.allowed; fundEnterprise = checked.enterprise; fundBreakdown = checked.breakdown;
    } catch (err) { return res.status(400).json({ success:false, message:err.message }); }
  }

  const paidAmount = Math.max(0, Math.round((priceAfterCoupon - fundUsed) * 100) / 100);

  // 真实服务统一使用普通微信小程序支付。最终入账只接受微信回调或服务端主动查单，
  // 绝不以客户端 requestPayment 的 success 回调直接确认已支付。
  if (paidAmount > 0 && paymentMethod !== 'wechat_pay') {
    return res.status(400).json({ success: false, message: '该服务须使用微信小程序支付' });
  }
  const commercePaymentChannel = service.paymentChannel || 'wechat_pay';
  if (paidAmount > 0 && commercePaymentChannel !== 'wechat_pay') {
    return res.status(409).json({ success: false, message: '该商品当前未配置普通微信支付，请联系客服' });
  }
  if (paidAmount > 0 && !req.user.wechatMpOpenid) {
    return res.status(400).json({ success: false, message: '请先使用微信登录绑定当前小程序账号后再支付' });
  }

  const paymentParts = [];
  if (fundUsed > 0) paymentParts.push(`健康基金抵扣¥${fundUsed}`);
  if (couponDiscount > 0) paymentParts.push(`优惠券抵扣¥${couponDiscount}`);
  if (paymentMethod) paymentParts.push(`支付方式：${paymentMethod}`);
  const orderNote = [note, paymentParts.join('；')].filter(Boolean).join('；');

  // 谁推送谁获推广费：查该会员对这个产品最近一次的推送记录，推送人自动定为转介绍人(referrerId)，
  // 不需要超管事后手动指定。服务人(fulfillerId)不默认等于推送人——用户明确"推送人和服务人不一定是
  // 同一个"，仍需推荐人本人或超管另行指定（PATCH /staff/orders/:id/fulfiller），不产生服务人时
  // 该订单只生成推广费，不生成服务费。
  let referrerId = null;
  let servicePerformers = [];
  let productShare = null;
  if (shareToken && product) {
    productShare = await ProductShare.findOne({
      token: shareToken,
      productId: product._id,
      recipientUserId: req.user._id,
      convertedOrderId: null,
      expiresAt: { $gt: new Date() },
    });
    if (productShare?.sharerStaffId) referrerId = productShare.sharerStaffId;
  }
  if (product) {
    const lastPush = await PushRecord.findOne({ patientId: req.user._id, type: 'product', $or: [
      { productId: service.id }, { 'products.productId': service.id },
    ] })
      .sort({ createdAt: -1 }).select('staffId servicePerformers');
    if (lastPush && !referrerId) {
      referrerId = lastPush.staffId;
      // 推送时为该产品指定的各岗位服务人（productId 匹配或未标 productId 的通用项）带入订单，供核销结算按岗位发绩效
      servicePerformers = (lastPush.servicePerformers || [])
        .filter(sp => sp.role && sp.staffId && (!sp.productId || String(sp.productId) === String(service.id)))
        .map(sp => ({ role: sp.role, staffId: sp.staffId }));
    }
  }

  // 已配置规划师时自动派单；尚未配置也允许先完成购买，由客服后续配置和跟进。
  const followUpStaffId = await resolveHealthPlanner(req.user._id);

  const outTradeNo = `JY${Date.now()}${new mongoose.Types.ObjectId().toString().slice(-8)}`.slice(0, 32);
  const orderNo = outTradeNo;
  const order = await Order.create({
    user:         req.user._id,
    serviceId:    service.id,
    serviceName:  isPkg ? `${service.name}（${service.duration}）` : service.name,
    servicePrice: service.price,
    specificationLabel: service.specificationLabel || '',
    skuCode: service.skuCode || '',
    unitPrice,
    totalUnits,
    usedUnits: 0,
    serviceIcon:  service.icon || 'shield-checkmark',
    note:         orderNote,
    status:       'pending',
    orderNo,
    tradeStatus: paidAmount > 0 ? 'awaiting_payment' : 'paid',
    fulfillmentType: service.skuFulfillmentType || service.fulfillmentType || (isPkg ? 'subscription_service' : 'offline_service'),
    orderType:    isPkg ? 'package' : (product ? 'product' : 'service'),
    referrerId,
    servicePerformers,
    serviceItemsSnapshot: productServiceItems.map(item => ({
      key: item.key, name: item.name, units: item.units, usedUnits: 0,
      performers: (item.performers || []).map(p => p.toObject ? p.toObject() : p),
    })),
    performanceRuleSnapshot: product?.performanceRule ? (product.performanceRule.toObject ? product.performanceRule.toObject() : product.performanceRule) : null,
    servicePerformerRolesSnapshot: (product?.servicePerformerRoles || []).map(p => p.toObject ? p.toObject() : p),
    paymentMethod: fundUsed > 0 && paidAmount === 0 ? 'healthFund' : (paidAmount > 0 ? 'wechat' : ''),
    paymentStatus: paidAmount > 0 ? 'pending' : 'paid',
    paidAmount: 0,
    paymentExpectedAmount: paidAmount,
    paymentOutTradeNo: paidAmount > 0 ? outTradeNo : '',
    paymentProductId: '',
    paymentEnvironment: paidAmount > 0 ? 'production' : '',
    healthFundAmount: fundUsed,
    healthFundBreakdown: fundBreakdown,
    healthFundEnterpriseId: fundEnterprise?._id || null,
    couponId: coupon?._id || null,
    couponDiscount,
  });
  if (productShare) {
    productShare.convertedOrderId = order._id;
    productShare.convertedAt = new Date();
    productShare.rewardStatus = productShare.sharerType === 'customer' ? 'pending' : 'none';
    await productShare.save();
  }

  // 下单后需要人工跟进的待办：只生成 FollowUp（医护端"待随访任务"面板的数据源，也是用户端展示的唯一数据源），
  // 不再同时创建 Task——此前两套模型无关联字段，导致同一次预约在用户端出现两条重复卡片，
  // 且医护端处理完 FollowUp 后 Task 状态永远不变，用户看不出到底有没有被处理。
  // Fully covered orders have no external payment step and can settle immediately.
  if (paidAmount === 0) {
  const pendingTasks = [];
  if (followUpStaffId) {
    pendingTasks.push(FollowUp.create({
      staffId: followUpStaffId,
      assignedTo: followUpStaffId,
      patientId: req.user._id,
      type: 'other',
      status: 'planned',
      theme: isPkg ? `服务包开通：${service.name}` : `预约：${service.name}`,
      content: orderNote || (isPkg ? '用户申请开通服务包，请联系确认支付并激活' : '用户已提交服务预约，请联系确认安排'),
      sourceType: 'order',
      sourceOrderId: order._id,
    }));
  }
  // 健康基金实时扣减（与订单绑定，note 记录用于哪笔订单）
  if (fundUsed > 0) pendingTasks.push(require('../utils/healthFundPayment').deductHealthFund({ user:req.user, enterprise:fundEnterprise, order, amount:fundUsed, breakdown:fundBreakdown }));
  // 优惠券标记已用
  if (coupon) {
    coupon.status = 'used';
    coupon.usedAt = new Date();
    coupon.usedOrderId = order._id;
    pendingTasks.push(coupon.save());
  }
  // 消费积分预记录：下单即按现金实付部分(paidAmount)记积分，不再等待后台人工标记已支付——
  // 那一步在实际业务里经常被跳过，导致用户明明支付了却查不到积分记录。订单后续若被取消/退款，
  // 会反查这笔预记积分退回（见 orders.js 取消接口 + admin.js 退款接口）
  pendingTasks.push(awardOrderPoints(order));
  await Promise.all(pendingTasks);
  order.paidAt = new Date();
  const fulfillment = await Fulfillment.findOneAndUpdate(
    { order: order._id },
    { $setOnInsert: { order: order._id, user: order.user, type: order.fulfillmentType, status: order.fulfillmentType === 'delivery_and_service' ? 'awaiting_shipment' : 'awaiting_booking', note: order.note || '' } },
    { upsert: true, new: true },
  );
  order.fulfillmentId = fulfillment._id;
  order.fulfillmentStatus = fulfillment.status;
  await order.save();
  await require('../utils/commissionSettlement').settleReferralCommission(order);
  await require('../utils/productShareRewards').grantProductShareRewards(order);
  }

  let payment = null;
  let paymentParams = null;
  if (paidAmount > 0) {
    payment = await Payment.create({
      order: order._id,
      user: req.user._id,
      channel: 'wechat_pay',
      status: 'created',
      amount: paidAmount,
      outTradeNo,
    });
    try {
      const prepay = await wechatPay.createJsapiPayment({
        description: service.name,
        outTradeNo,
        amount: paidAmount,
        openid: req.user.wechatMpOpenid,
        attach: order._id.toString(),
      });
      payment.prepayId = prepay.prepayId;
      payment.status = 'processing';
      await payment.save();
      order.paymentId = payment._id;
      await order.save();
      paymentParams = prepay.client;
    } catch (err) {
      payment.status = 'failed';
      payment.failureCode = err.code || 'CREATE_PAYMENT_FAILED';
      payment.failureMessage = err.message;
      await payment.save();
      order.tradeStatus = 'closed';
      order.paymentStatus = 'failed';
      await order.save();
      return res.status(503).json({ success: false, message: `微信支付下单失败：${err.message}`, data: { orderId: order._id } });
    }
  }

  res.json({
    success: true,
    message: paidAmount > 0
      ? '订单已创建，请完成微信支付；支付结果以微信服务端确认为准'
      : (isPkg ? '服务包订单已支付，健管师将在 1 个工作日内联系您安排服务' : '订单已支付，健管师将在 1-2 个工作日内与您联系'),
    data: {
      orderId: order._id,
      orderNo: order.orderNo || order._id.toString().slice(-8).toUpperCase(),
      originalPrice: service.price,
      fundUsed,
      couponDiscount,
      paidAmount,
      paymentParams,
      paymentStatus: order.paymentStatus,
    },
  });
});

module.exports = router;
