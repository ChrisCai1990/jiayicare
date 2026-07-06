const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Enterprise = require('../models/Enterprise');
const Order = require('../models/Order');
const OpsDashboardConfig = require('../models/OpsDashboardConfig');
const adminAuth = require('../middleware/adminAuth');

// 运营看板：对内(admin超管后台) + 对外(独立展示链接+口令) 共用同一份聚合数据，
// 保证两处展示的数字完全一致，不做成两套独立统计口径。

async function buildDashboardData() {
  const now = new Date();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [
    enterpriseCount,
    totalUsers,
    activatedUsers,
    newUsers7d,
    newUsers30d,
    chronicAgg,
    revenueAgg,
  ] = await Promise.all([
    Enterprise.countDocuments({ status: 'active' }),
    User.countDocuments(),
    User.countDocuments({ onboardingCompleted: true }),
    User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    User.aggregate([
      { $match: { chronicDiseases: { $exists: true, $ne: [] } } },
      { $unwind: '$chronicDiseases' },
      { $group: { _id: '$chronicDiseases', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    // 营收：按已完成订单的 servicePrice 粗略估算，非真实支付流水，仅供演示参考
    Order.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$servicePrice' }, count: { $sum: 1 } } },
    ]),
  ]);

  // 近30天每日新增用户趋势（供折线图）
  const dailyNewUsers = await User.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const revenueEstimate = revenueAgg[0]?.total || 0;
  const revenueOrderCount = revenueAgg[0]?.count || 0;

  return {
    generatedAt: now,
    enterprises: { total: enterpriseCount },
    users: {
      total: totalUsers,
      activated: activatedUsers,
      activationRate: totalUsers > 0 ? Math.round((activatedUsers / totalUsers) * 100) : 0,
      new7d: newUsers7d,
      new30d: newUsers30d,
    },
    chronicDiseases: chronicAgg.map(c => ({ name: c._id, count: c.count })),
    dailyNewUsers: dailyNewUsers.map(d => ({ date: d._id, count: d.count })),
    revenue: {
      estimateTotal: revenueEstimate,
      orderCount: revenueOrderCount,
      isEstimate: true, // 明确标注：非真实支付流水，按已完成订单价格粗略估算
      note: '该数据为演示估算值，非真实财务流水',
    },
  };
}

// ── 对内：admin超管后台登录态访问 ──────────────────────────────────
router.get('/internal', adminAuth, async (req, res) => {
  const data = await buildDashboardData();
  res.json({ success: true, data });
});

// ── 对外：长随机链接(slug) + 简单口令 双重访问控制 ──────────────────
// POST /api/ops-dashboard/public/:slug/verify — slug对应URL里的随机路径段，口令做二次确认
router.post('/public/:slug/verify', async (req, res) => {
  const { passcode } = req.body;
  const config = await OpsDashboardConfig.findOne();
  if (!config || !config.enabled || config.slug !== req.params.slug) {
    return res.status(404).json({ success: false, message: '链接无效或展示看板暂未开放' });
  }
  if (!config.passcode || config.passcode !== passcode) {
    return res.status(401).json({ success: false, message: '口令错误' });
  }
  res.json({ success: true });
});

// GET /api/ops-dashboard/public/:slug/data?passcode=xxx — 每次拉取数据都带口令校验，避免链接泄露后长期可访问
router.get('/public/:slug/data', async (req, res) => {
  const { passcode } = req.query;
  const config = await OpsDashboardConfig.findOne();
  if (!config || !config.enabled || config.slug !== req.params.slug) {
    return res.status(404).json({ success: false, message: '链接无效或展示看板暂未开放' });
  }
  if (!config.passcode || config.passcode !== passcode) {
    return res.status(401).json({ success: false, message: '口令错误' });
  }
  const data = await buildDashboardData();
  res.json({ success: true, data });
});

// ── admin后台维护口令 ──────────────────────────────────────────────
router.get('/config', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可查看' });
  }
  let config = await OpsDashboardConfig.findOne();
  if (!config) config = await OpsDashboardConfig.create({ passcode: '', enabled: true });
  res.json({ success: true, data: config });
});

router.put('/config', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可修改' });
  }
  const { passcode, enabled } = req.body;
  let config = await OpsDashboardConfig.findOne();
  if (!config) config = new OpsDashboardConfig();
  if (passcode !== undefined) config.passcode = passcode;
  if (enabled !== undefined) config.enabled = enabled;
  await config.save();
  res.json({ success: true, data: config, message: '对外展示口令已更新' });
});

module.exports = router;
