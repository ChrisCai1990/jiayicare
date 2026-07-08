const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const Admin   = require('../models/Admin');
const User    = require('../models/User');
const Enterprise = require('../models/Enterprise');
const enterpriseHrAuth = require('../middleware/enterpriseHrAuth');

// POST /api/enterprise-hr/login —— 复用 Admin 账号体系，仅 role=enterprise_hr 可登录此入口
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
  }
  const admin = await Admin.findOne({ username });
  if (!admin || !(await admin.comparePassword(password))) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
  if (admin.role !== 'enterprise_hr' || !admin.enterpriseId) {
    return res.status(403).json({ success: false, message: '该账号非企业HR账号' });
  }
  const token = jwt.sign({ id: admin._id, type: 'admin', role: admin.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({
    success: true,
    data: { token, admin: { _id: admin._id, name: admin.name, role: admin.role, enterpriseId: admin.enterpriseId } },
  });
});

// GET /api/enterprise-hr/overview —— 本企业总览：合同信息 + 员工参与率
router.get('/overview', enterpriseHrAuth, async (req, res) => {
  const enterprise = await Enterprise.findById(req.enterpriseId);
  if (!enterprise) return res.status(404).json({ success: false, message: '企业信息不存在' });

  const [seatsUsed, activated] = await Promise.all([
    User.countDocuments({ enterpriseId: req.enterpriseId }),
    User.countDocuments({ enterpriseId: req.enterpriseId, onboardingCompleted: true }),
  ]);

  // 当年 HR 财务数据（超管手工录入）；可通过 ?year= 指定，默认当前年
  const year = String(req.query.year || new Date().getFullYear());
  const hrByYear = enterprise.hrDataByYear || {};
  const hrData = hrByYear[year] || null;
  const availableYears = Object.keys(hrByYear).sort((a, b) => Number(b) - Number(a));

  res.json({
    success: true,
    data: {
      enterprise: {
        name: enterprise.name, contractStartAt: enterprise.contractStartAt, contractEndAt: enterprise.contractEndAt,
        seatsTotal: enterprise.seatsTotal, packageType: enterprise.packageType, status: enterprise.status,
      },
      seatsUsed,
      seatsRemaining: Math.max(enterprise.seatsTotal - seatsUsed, 0),
      activated,
      activationRate: seatsUsed > 0 ? Math.round((activated / seatsUsed) * 100) : 0,
      year,
      availableYears,
      hrData,   // 体检机构/人数/客单价/总额、保险、健康管理费、其他付费服务（无数据时为 null）
    },
  });
});

// GET /api/enterprise-hr/health-summary —— 员工群体健康数据聚合（脱敏，不含任何可识别个人的字段）
router.get('/health-summary', enterpriseHrAuth, async (req, res) => {
  const users = await User.find({ enterpriseId: req.enterpriseId })
    .select('healthScore gender age ascvdRisk onboardingCompleted');

  const total = users.length;
  const activated = users.filter(u => u.onboardingCompleted).length;

  // 健康分分布（分段计数，不暴露个人分数与身份）
  const scoreBuckets = { '优秀(90+)': 0, '良好(75-89)': 0, '中等(60-74)': 0, '待改善(<60)': 0 };
  users.forEach(u => {
    const s = u.healthScore || 0;
    if (s >= 90) scoreBuckets['优秀(90+)']++;
    else if (s >= 75) scoreBuckets['良好(75-89)']++;
    else if (s >= 60) scoreBuckets['中等(60-74)']++;
    else scoreBuckets['待改善(<60)']++;
  });

  // ASCVD 10年风险分层聚合（取各员工最新一年评估）
  const ascvdBuckets = { low: 0, medium: 0, high: 0, unassessed: 0 };
  users.forEach(u => {
    const byYear = u.ascvdRisk?.byYear;
    if (!byYear || Object.keys(byYear).length === 0) { ascvdBuckets.unassessed++; return; }
    const latestYear = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))[0];
    const level = byYear[latestYear]?.level;
    if (ascvdBuckets[level] !== undefined) ascvdBuckets[level]++;
    else ascvdBuckets.unassessed++;
  });

  // 年龄段分布
  const ageBuckets = { '<30': 0, '30-39': 0, '40-49': 0, '50-59': 0, '60+': 0, '未知': 0 };
  users.forEach(u => {
    const a = u.age;
    if (!a) ageBuckets['未知']++;
    else if (a < 30) ageBuckets['<30']++;
    else if (a < 40) ageBuckets['30-39']++;
    else if (a < 50) ageBuckets['40-49']++;
    else if (a < 60) ageBuckets['50-59']++;
    else ageBuckets['60+']++;
  });

  res.json({
    success: true,
    data: { total, activated, scoreBuckets, ascvdBuckets, ageBuckets },
  });
});

module.exports = router;
