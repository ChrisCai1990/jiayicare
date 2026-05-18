const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const Task    = require('../models/Task');
const Order   = require('../models/Order');

// ── 服务目录（静态数据，运营配置）────────────────────────────────
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

// GET /api/services — 获取服务目录
router.get('/', auth, (req, res) => {
  res.json({ success: true, data: { categories: CATEGORIES, services: SERVICE_CATALOG } });
});

// ── 服务包目录（首次开通 & 续费使用）────────────────────────────
const PACKAGE_CATALOG = [
  { id: 'pkg_1y', name: '年度服务包', duration: '12 个月', price: 2980, originalPrice: 3980, icon: 'shield-checkmark', category: '服务包' },
  { id: 'pkg_6m', name: '半年服务包', duration: '6 个月',  price: 1680, originalPrice: 1980, icon: 'shield-checkmark', category: '服务包' },
  { id: 'pkg_3m', name: '季度服务包', duration: '3 个月',  price: 980,  originalPrice: 1180, icon: 'shield-checkmark', category: '服务包' },
];

// POST /api/services/order — 提交服务预约（支持单项服务 & 服务包）
router.post('/order', auth, async (req, res) => {
  const { serviceId, note, paymentMethod } = req.body;
  if (!serviceId) {
    return res.status(400).json({ success: false, message: '请指定服务项目' });
  }

  // 先在单项服务中查找，再在服务包中查找
  const service = SERVICE_CATALOG.find(s => s.id === serviceId)
               || PACKAGE_CATALOG.find(p => p.id === serviceId);
  if (!service) {
    return res.status(404).json({ success: false, message: '服务项目不存在' });
  }

  const isPkg     = !!PACKAGE_CATALOG.find(p => p.id === serviceId);
  const orderNote = [note, paymentMethod ? `支付方式：${paymentMethod}` : ''].filter(Boolean).join('；');

  const [order] = await Promise.all([
    Order.create({
      user:         req.user._id,
      serviceId:    service.id,
      serviceName:  isPkg ? `${service.name}（${service.duration}）` : service.name,
      servicePrice: service.price,
      serviceIcon:  service.icon || 'shield-checkmark',
      note:         orderNote,
      status:       'pending',
      orderType:    isPkg ? 'package' : 'service',
    }),
    Task.create({
      user:        req.user._id,
      title:       isPkg ? `服务包开通：${service.name}` : `预约：${service.name}`,
      description: orderNote || (isPkg ? '用户申请开通服务包，请联系确认支付并激活' : '用户已提交服务预约，请联系确认安排'),
      priority:    'high',
      status:      'pending',
      dueDate:     '待确认',
      dueTime:     '',
      assignee:    '健管专员',
      type:        'consultation',
      category:    isPkg ? '服务包开通' : '服务预约',
    }),
  ]);

  res.json({
    success: true,
    message: isPkg ? '服务包申请已提交，健管师将在 1 个工作日内联系您完成支付与激活' : '预约申请已提交，健管师将在 1-2 个工作日内与您联系',
    data: { orderId: order._id, orderNo: order._id.toString().slice(-8).toUpperCase() },
  });
});

module.exports = router;
