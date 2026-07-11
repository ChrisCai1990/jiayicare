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

// ── 静态兜底（DB 为空时使用 / 订单查找用）────────────────────────
const SERVICE_CATALOG = [
  {
    id: 'S1', category: '检测套餐',
    name: '心脑血管精准检测套餐',
    subtitle: '含颈动脉超声 + 心脏彩超 + 血脂全套',
    price: 980, originalPrice: 1380,
    rating: 4.9, reviewCount: 326,
    tag: '热销', tagColor: '#E74C3C',
    icon: 'heart', iconColor: '#E74C3C',
    features: ['三甲医院专家操作', '24h报告解读', '健管专员跟进'],
  },
  {
    id: 'S2', category: '专家咨询',
    name: '心内科专家30分钟视频问诊',
    subtitle: '主任医师一对一，报告解读+用药建议',
    price: 299, originalPrice: 499,
    rating: 4.8, reviewCount: 512,
    tag: '限时折扣', tagColor: '#F39C12',
    icon: 'videocam', iconColor: '#1A7A8A',
    features: ['三甲主任医师', '可上传检查报告', '会后总结文字版'],
  },
  {
    id: 'S3', category: '上门服务',
    name: '上门采血 + 基础体检',
    subtitle: '护士上门抽血，含血常规、血脂、血糖、肝肾功能',
    price: 199, originalPrice: 280,
    rating: 4.7, reviewCount: 188,
    tag: '上门服务', tagColor: '#27AE60',
    icon: 'home', iconColor: '#27AE60',
    features: ['持证护士上门', '2小时出结果', '电子报告推送'],
  },
  {
    id: 'S4', category: '健康课程',
    name: '高血压患者自我管理训练营',
    subtitle: '4周系统课程，含饮食+运动+用药+监测',
    price: 399, originalPrice: 598,
    rating: 4.9, reviewCount: 243,
    tag: '精品课', tagColor: '#7B68EE',
    icon: 'school', iconColor: '#7B68EE',
    features: ['专属营养师指导', '每日打卡督导', '课程永久回看'],
  },
  {
    id: 'S5', category: '检测套餐',
    name: '糖化血红蛋白 + 胰岛素三项',
    subtitle: '全面评估血糖控制水平',
    price: 258, originalPrice: 360,
    rating: 4.8, reviewCount: 97,
    tag: '新品', tagColor: '#3DC8A0',
    icon: 'water', iconColor: '#F39C12',
    features: ['居家采样', '3天出报告', '医生解读'],
  },
  {
    id: 'S6', category: '专家咨询',
    name: '营养师一对一方案定制',
    subtitle: '根据病情定制个性化饮食计划',
    price: 168, originalPrice: 238,
    rating: 4.7, reviewCount: 341,
    tag: '', tagColor: '',
    icon: 'nutrition', iconColor: '#27AE60',
    features: ['注册营养师', '7天跟踪调整', '电子版方案'],
  },
];

const CATEGORIES = ['全部', '检测套餐', '专家咨询', '上门服务', '健康课程'];

const Product = require('../models/Product');

// GET /api/services — 从商城产品获取（管理员在后台维护的 Products）
router.get('/', auth, async (req, res) => {
  const products = await Product.find({ status: 'on' }).sort({ sortOrder: 1, createdAt: 1 });

  // 无上架产品时回退静态目录
  if (products.length === 0) {
    const categories = CATEGORIES;
    const services = SERVICE_CATALOG.map(s => ({
      id: s.id, category: s.category, name: s.name,
      subtitle: s.subtitle, price: s.price, originalPrice: s.originalPrice,
      rating: s.rating, reviewCount: s.reviewCount,
      tag: s.tag, tagColor: s.tagColor, icon: s.icon, iconColor: s.iconColor,
      features: s.features,
    }));
    return res.json({ success: true, data: { categories, services } });
  }

  const categories = ['全部', ...new Set(products.map(p => p.category))];
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
    };
  });

  res.json({ success: true, data: { categories, services } });
});

// GET /api/services/coupons — 当前用户可用的优惠券
router.get('/coupons', auth, async (req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    patientId: req.user._id,
    status: 'active',
    $or: [{ validTo: null }, { validTo: { $gte: now } }],
  }).sort({ createdAt: -1 });
  res.json({ success: true, data: coupons });
});

// ── 服务包目录（首次开通 & 续费使用）────────────────────────────
const PACKAGE_CATALOG = [
  { id: 'pkg_1y', name: '年度服务包', duration: '12 个月', price: 3650, originalPrice: 5000, icon: 'shield-checkmark', category: '服务包' },
  { id: 'pkg_6m', name: '半年服务包', duration: '6 个月',  price: 1980, originalPrice: 2800, icon: 'shield-checkmark', category: '服务包' },
  { id: 'pkg_3m', name: '季度服务包', duration: '3 个月',  price: 1080, originalPrice: 1480, icon: 'shield-checkmark', category: '服务包' },
];

// POST /api/services/order — 提交服务预约（支持单项服务 & 服务包）
// useHealthFund: 本次要抵扣的健康基金金额（元，<= 余额 且 <= 订单原价）
// couponId: 本次要使用的优惠券 _id（amount 满减 或 percent 折扣，两者可叠加使用）
router.post('/order', auth, async (req, res) => {
  const { serviceId, note, paymentMethod, useHealthFund, couponId } = req.body;
  if (!serviceId) {
    return res.status(400).json({ success: false, message: '请指定服务项目' });
  }

  // 先从 Product 集合查（管理员维护的商城产品），再查 Service，最后回退静态目录
  let service = null;
  const product = await Product.findById(serviceId).catch(() => null);
  if (product) {
    const firstPrice = product.servicePrices?.[0];
    service = { id: product._id.toString(), name: product.name, price: firstPrice ? firstPrice.price : product.originalPrice, icon: 'storefront-outline' };
  }
  if (!service) {
    const dbSvc = await Service.findOne({ serviceId });
    if (dbSvc) service = { id: dbSvc.serviceId, name: dbSvc.name, price: dbSvc.price, icon: dbSvc.icon || 'star-outline' };
  }
  if (!service) service = SERVICE_CATALOG.find(s => s.id === serviceId) || PACKAGE_CATALOG.find(p => p.id === serviceId);
  if (!service) {
    return res.status(404).json({ success: false, message: '服务项目不存在' });
  }

  const isPkg     = !!PACKAGE_CATALOG.find(p => p.id === serviceId);

  // ── 健康基金 + 优惠券抵扣（下单即扣，实时校验余额/券状态）──────────
  let coupon = null;
  let couponDiscount = 0;
  if (couponId) {
    coupon = await Coupon.findOne({ _id: couponId, patientId: req.user._id, status: 'active' });
    if (!coupon) {
      return res.status(400).json({ success: false, message: '优惠券不可用或已使用' });
    }
    if (coupon.validTo && new Date(coupon.validTo) < new Date()) {
      return res.status(400).json({ success: false, message: '优惠券已过期' });
    }
    if (coupon.minSpend && service.price < coupon.minSpend) {
      return res.status(400).json({ success: false, message: `订单需满 ¥${coupon.minSpend} 才能使用此券` });
    }
    couponDiscount = coupon.type === 'amount'
      ? coupon.value
      : Math.round(service.price * (100 - coupon.value)) / 100;
    couponDiscount = Math.min(couponDiscount, service.price);
  }

  const priceAfterCoupon = Math.max(0, Math.round((service.price - couponDiscount) * 100) / 100);

  let fundUsed = 0;
  if (useHealthFund > 0) {
    const balance = req.user.healthFundBalance || 0;
    if (useHealthFund > balance) {
      return res.status(400).json({ success: false, message: '健康基金余额不足' });
    }
    fundUsed = Math.min(useHealthFund, priceAfterCoupon);
  }

  const paidAmount = Math.max(0, Math.round((priceAfterCoupon - fundUsed) * 100) / 100);

  const paymentParts = [];
  if (fundUsed > 0) paymentParts.push(`健康基金抵扣¥${fundUsed}`);
  if (couponDiscount > 0) paymentParts.push(`优惠券抵扣¥${couponDiscount}`);
  if (paymentMethod) paymentParts.push(`支付方式：${paymentMethod}`);
  const orderNote = [note, paymentParts.join('；')].filter(Boolean).join('；');

  // 谁推送谁获推广费：查该患者对这个产品最近一次的推送记录，推送人自动定为转介绍人(referrerId)，
  // 不需要超管事后手动指定。服务人(fulfillerId)不默认等于推送人——用户明确"推送人和服务人不一定是
  // 同一个"，仍需推荐人本人或超管另行指定（PATCH /staff/orders/:id/fulfiller），不产生服务人时
  // 该订单只生成推广费，不生成服务费。
  let referrerId = null;
  let servicePerformers = [];
  if (product) {
    const lastPush = await PushRecord.findOne({ patientId: req.user._id, type: 'product', productId: service.id })
      .sort({ createdAt: -1 }).select('staffId servicePerformers');
    if (lastPush) {
      referrerId = lastPush.staffId;
      // 推送时为该产品指定的各岗位服务人（productId 匹配或未标 productId 的通用项）带入订单，供核销结算按岗位发绩效
      servicePerformers = (lastPush.servicePerformers || [])
        .filter(sp => sp.role && sp.staffId && (!sp.productId || String(sp.productId) === String(service.id)))
        .map(sp => ({ role: sp.role, staffId: sp.staffId }));
    }
  }

  const order = await Order.create({
    user:         req.user._id,
    serviceId:    service.id,
    serviceName:  isPkg ? `${service.name}（${service.duration}）` : service.name,
    servicePrice: service.price,
    serviceIcon:  service.icon || 'shield-checkmark',
    note:         orderNote,
    status:       'pending',
    orderType:    isPkg ? 'package' : 'service',
    referrerId,
    servicePerformers,
    paymentMethod: fundUsed > 0 && paidAmount === 0 ? 'healthFund' : (paymentMethod || ''),
    paidAmount,
  });

  // 下单后需要健管专员跟进的待办：只生成 FollowUp（医护端"待随访任务"面板的数据源，也是用户端展示的唯一数据源），
  // 不再同时创建 Task——此前两套模型无关联字段，导致同一次预约在用户端出现两条重复卡片，
  // 且医护端处理完 FollowUp 后 Task 状态永远不变，用户看不出到底有没有被处理。
  // staffId 优先归到该患者名下的健管专员，没分配则退回家庭医生，都没有（新客户尚未分配）则兜底给 superadmin，避免漏单
  const patientForStaff = await User.findById(req.user._id).select('assignedHealthManager assignedFamilyDoctor');
  let followUpStaffId = patientForStaff?.assignedHealthManager || patientForStaff?.assignedFamilyDoctor || null;
  if (!followUpStaffId) {
    const superadmin = await Admin.findOne({ role: 'superadmin' }).select('_id');
    followUpStaffId = superadmin?._id || null;
  }

  const pendingTasks = [];
  if (followUpStaffId) {
    pendingTasks.push(FollowUp.create({
      staffId:   followUpStaffId,
      patientId: req.user._id,
      type:      'other',
      status:    'planned',
      theme:     isPkg ? `服务包开通：${service.name}` : `预约：${service.name}`,
      content:   orderNote || (isPkg ? '用户申请开通服务包，请联系确认支付并激活' : '用户已提交服务预约，请联系确认安排'),
      sourceType: 'order',
      sourceOrderId: order._id,
    }));
  }
  // 健康基金实时扣减（与订单绑定，note 记录用于哪笔订单）
  if (fundUsed > 0) {
    pendingTasks.push(User.collection.updateOne(
      { _id: req.user._id },
      { $inc: { healthFundBalance: -fundUsed } }
    ));
  }
  // 优惠券标记已用
  if (coupon) {
    coupon.status = 'used';
    coupon.usedAt = new Date();
    coupon.usedOrderId = order._id;
    pendingTasks.push(coupon.save());
  }
  await Promise.all(pendingTasks);

  res.json({
    success: true,
    message: isPkg ? '服务包申请已提交，健管师将在 1 个工作日内联系您完成支付与激活' : '预约申请已提交，健管师将在 1-2 个工作日内与您联系',
    data: {
      orderId: order._id,
      orderNo: order._id.toString().slice(-8).toUpperCase(),
      originalPrice: service.price,
      fundUsed,
      couponDiscount,
      paidAmount,
    },
  });
});

module.exports = router;
