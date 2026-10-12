const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const Admin   = require('../models/Admin');
const User    = require('../models/User');
const Enterprise = require('../models/Enterprise');
const EnterpriseServiceRecord = require('../models/EnterpriseServiceRecord');
const EnterpriseInsurancePolicy = require('../models/EnterpriseInsurancePolicy');
const InsuranceEnrollment = require('../models/InsuranceEnrollment');
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
  if (admin.staffStatus === 'inactive') {
    return res.status(403).json({ success: false, message: '账号已停用' });
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

  const employeeFilter = { enterpriseId: req.enterpriseId, enterpriseAssociationType: { $ne: 'dependent' } };
  const [seatsUsed, activated, dependentsCount] = await Promise.all([
    User.countDocuments(employeeFilter),
    User.countDocuments({ ...employeeFilter, onboardingCompleted: true }),
    User.countDocuments({ enterpriseId: req.enterpriseId, enterpriseAssociationType: 'dependent' }),
  ]);

  // HR 财务数据（超管手工录入）；可通过 ?year= 指定
  const hrByYear = enterprise.hrDataByYear || {};
  const recordYears = await EnterpriseServiceRecord.distinct('year', {
    enterpriseId: req.enterpriseId, publishedAt: { $ne: null },
  });
  const availableYears = [...new Set([...Object.keys(hrByYear), ...recordYears.map(String)])]
    .sort((a, b) => Number(b) - Number(a));
  // 默认年份智能落位：显式指定则用指定年；否则当前年有数据就用当前年，
  // 没有则落到最近有数据的那一年（避免企业只录了往年数据时，HR 登录默认看到空白当前年）
  const currentYear = String(new Date().getFullYear());
  let year;
  if (req.query.year) year = String(req.query.year);
  else if (hrByYear[currentYear]) year = currentYear;
  else year = availableYears[0] || currentYear;
  const hrData = hrByYear[year] || null;
  const serviceRecords = await EnterpriseServiceRecord.find({
    enterpriseId: req.enterpriseId, year: Number(year), publishedAt: { $ne: null },
  }).sort({ createdAt: -1 }).select('year period kind title summary file.name file.size publishedAt createdAt').lean();
  // 只有参保名单与该年度HR手工总人数一致，才展示员工参保/未参保对照。
  // 员工账户是当前快照，不能把该分组当作历史年度的健康变化。
  const policies = await EnterpriseInsurancePolicy.find({ enterpriseId: req.enterpriseId, year: Number(year) }).select('_id').lean();
  const enrollments = policies.length ? await InsuranceEnrollment.find({
    enterpriseId: req.enterpriseId, policyId: { $in: policies.map(p => p._id) },
    status: { $in: ['active', 'terminated'] },
  }).select('userId relation').lean() : [];
  const enrolledIds = [...new Set(enrollments.map(item => String(item.userId)))];
  const insuredCount = Number(hrData?.insuredCount || 0);
  let cohortSummary = { status: 'missing_roster', enrolledCount: enrolledIds.length, expectedCount: insuredCount };
  if (insuredCount > 0 && enrolledIds.length === insuredCount) {
    const [employees, enrolledUsers] = await Promise.all([
      User.find({ enterpriseId: req.enterpriseId, enterpriseAssociationType: { $ne: 'dependent' } })
        .select('_id onboardingCompleted healthScore').lean(),
      User.find({ enterpriseId: req.enterpriseId, _id: { $in: enrolledIds } })
        .select('_id enterpriseAssociationType').lean(),
    ]);
    const byId = new Map(enrolledUsers.map(user => [String(user._id), user]));
    if (byId.size === insuredCount) {
      const insuredEmployeeIds = new Set(enrollments.filter(item => {
        const user = byId.get(String(item.userId));
        return user?.enterpriseAssociationType !== 'dependent' && item.relation === 'employee';
      }).map(item => String(item.userId)));
      const insuredEmployees = employees.filter(user => insuredEmployeeIds.has(String(user._id)));
      const uninsuredEmployees = employees.filter(user => !insuredEmployeeIds.has(String(user._id)));
      const group = (users) => ({
        count: users.length,
        // 小组人数不足10时不返回参与/健康数据，防止在HR端回推到个人。
        activated: users.length >= 10 ? users.filter(user => user.onboardingCompleted).length : null,
        assessed: users.length >= 10 ? users.filter(user => Number.isFinite(user.healthScore) && user.healthScore > 0).length : null,
      });
      cohortSummary = {
        status: 'ready', source: '当前关联员工与所选保单年度参保名单',
        insuredEmployees: group(insuredEmployees), uninsuredEmployees: group(uninsuredEmployees),
        insuredDependents: insuredCount - insuredEmployeeIds.size,
      };
    } else cohortSummary.status = 'incomplete_mapping';
  } else if (enrolledIds.length > 0) cohortSummary.status = 'count_mismatch';
  const account = await require('../models/EnterpriseSharedFund').findOne({ enterpriseId: enterprise._id, year: Number(year) }).lean();

  res.json({
    success: true,
    data: {
      enterprise: {
        name: enterprise.name, contractStartAt: enterprise.contractStartAt, contractEndAt: enterprise.contractEndAt,
        packageType: enterprise.packageType, status: enterprise.status,
      },
      // 已分配/已激活/激活率：员工账号跨年沿用，无年度归属，统计的是当前实时状态，不随下方年度选择变化
      seatsUsed,
      activated,
      dependentsCount,
      activationRate: seatsUsed > 0 ? Math.round((activated / seatsUsed) * 100) : 0,
      year,
      availableYears,
      hrData,   // 体检机构/人数/客单价/总额、保险、健康管理费、其他付费服务、当年采购名额（无数据时为 null）
      cohortSummary,
      serviceRecords: serviceRecords.map(r => ({
        _id: r._id, year: r.year, period: r.period, kind: r.kind,
        title: r.title, summary: r.summary, fileName: r.file?.name,
        fileSize: r.file?.size, publishedAt: r.publishedAt, createdAt: r.createdAt,
      })),
      sharedFund: require('../utils/enterpriseSharedFund').summary(account, enterprise),
    },
  });
});

// GET /api/enterprise-hr/health-summary —— 员工群体健康数据聚合（脱敏，不含任何可识别个人的字段）
router.get('/health-summary', enterpriseHrAuth, async (req, res) => {
  const users = await User.find({ enterpriseId: req.enterpriseId, enterpriseAssociationType: { $ne: 'dependent' } })
    .select('healthScore gender age ascvdRisk onboardingCompleted');

  const total = users.length;
  const activated = users.filter(u => u.onboardingCompleted).length;

  // 健康分分布（分段计数，不暴露个人分数与身份）
  const scoreBuckets = { '优秀(90+)': 0, '良好(75-89)': 0, '中等(60-74)': 0, '待改善(<60)': 0, '未评估': 0 };
  users.forEach(u => {
    const s = u.healthScore;
    if (!Number.isFinite(s) || s <= 0) { scoreBuckets['未评估']++; return; }
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
    data: { total, activated, scoreBuckets, ascvdBuckets, ageBuckets, generatedAt: new Date().toISOString() },
  });
});

module.exports = router;
