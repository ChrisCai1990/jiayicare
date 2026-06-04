const express = require('express');
const crypto = require('crypto');

// 解析血型字符串 "A型 Rh+" → { abo: 'A', rh: '阳性' }
function parseBloodType(str) {
  if (!str) return {};
  const s = str.toUpperCase();
  let abo = '';
  for (const t of ['AB', 'A', 'B', 'O']) {
    if (s.includes(t)) { abo = t; break; }
  }
  let rh = '';
  if (s.includes('+') || s.includes('阳') || s.includes('POS')) rh = '阳性';
  else if (s.includes('-') || s.includes('阴') || s.includes('NEG')) rh = '阴性';
  return { abo, rh };
}
const auth = require('../middleware/auth');
const Admin = require('../models/Admin');
const User = require('../models/User');
const UserChangeLog = require('../models/UserChangeLog');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const Reminder = require('../models/Reminder');
const SystemConfig = require('../models/SystemConfig');
const ShareToken = require('../models/ShareToken');
const CheckupPlan = require('../models/CheckupPlan');
const GiftRecord   = require('../models/GiftRecord');
const HealthPlan   = require('../models/HealthPlan');
const PushRecord   = require('../models/PushRecord');
const Order        = require('../models/Order');
const Message      = require('../models/Message');
const FollowUp         = require('../models/FollowUp');
const ExamRequisition  = require('../models/ExamRequisition');
const AnnualPlan       = require('../models/AnnualPlan');
const { isActiveToday } = require('./reminders');
const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dist-maowxvion-jiayihui.vercel.app';

// 服务包 ID → 中文名称映射
const SERVICE_PACKAGE_LABELS = {
  health_prevention: '健康预防计划',
  chronic_stable:    '慢病维稳计划',
  young_state:       '健康年轻态计划',
  health_reshape:    '健康重塑计划',
  pkg_1y:            '年度服务包',
  pkg_6m:            '半年服务包',
  pkg_3m:            '季度服务包',
};

// 获取当前用户信息（含健康基金汇总 + 责任团队真实数据）
router.get('/me', auth, async (req, res) => {
  try {
    const giftFundAgg = await GiftRecord.aggregate([
      { $match: { patientId: req.user._id, giftType: 'fund', status: 'active' } },
      { $group: { _id: '$fundType', total: { $sum: '$fundAmount' } } },
    ]);
    const enterpriseFund = giftFundAgg.find(g => g._id === 'enterprise')?.total || 0;
    const totalBalance = req.user.healthFundBalance || 0;
    const healthFund = {
      total:     totalBalance,
      corporate: Math.min(enterpriseFund, totalBalance),
      personal:  Math.max(0, totalBalance - enterpriseFund),
    };

    // 查询已分配的责任人员信息（实时 populate）
    const staffIds = [
      req.user.assignedFamilyDoctor,
      req.user.assignedNutritionist,
      req.user.assignedHealthManager,
    ].filter(Boolean);

    const staffMap = {};
    if (staffIds.length > 0) {
      const staffList = await Admin.find({ _id: { $in: staffIds } }).select('name title role').lean();
      staffList.forEach(s => { staffMap[String(s._id)] = s; });
    }

    const toStaffInfo = (id, roleLabel) => {
      if (!id) return null;
      const s = staffMap[String(id)];
      if (!s) return null;
      return { name: s.name, title: s.title || roleLabel };
    };

    const userData = req.user.toObject();
    // 覆盖 doctor / manager 字段为真实分配数据
    const fdInfo = toStaffInfo(req.user.assignedFamilyDoctor, '家庭医师');
    const nsInfo = toStaffInfo(req.user.assignedNutritionist, '营养师');
    const hmInfo = toStaffInfo(req.user.assignedHealthManager, '健管专员');

    if (fdInfo) userData.doctor = { name: fdInfo.name, title: fdInfo.title };
    if (hmInfo) userData.manager = { name: hmInfo.name, title: hmInfo.title };

    // 附加完整团队字段（供 app 展示营养师）
    userData.careTeam = [
      fdInfo ? { name: fdInfo.name, role: fdInfo.title || '家庭医师' } : null,
      nsInfo ? { name: nsInfo.name, role: nsInfo.title || '营养师' }   : null,
      hmInfo ? { name: hmInfo.name, role: hmInfo.title || '健管专员' } : null,
    ].filter(Boolean);

    // 服务包名称映射（英文代码→中文）
    if (userData.servicePackage && SERVICE_PACKAGE_LABELS[userData.servicePackage]) {
      userData.servicePackageLabel = SERVICE_PACKAGE_LABELS[userData.servicePackage];
    }

    res.json({ success: true, data: { ...userData, healthFund } });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取用户信息失败', error: err.message });
  }
});

// 更新用户信息（支持 healthProfile + 联系信息变更日志）
router.put('/me', auth, async (req, res) => {
  try {
    const { name, age, gender, height, weight, servicePackage, serviceExpiry,
            contactPhone, deliveryAddress, healthProfile } = req.body;

    const updateData = {};
    if (name !== undefined)           updateData.name = name;
    if (age !== undefined)            updateData.age = age;
    if (gender !== undefined)         updateData.gender = gender;
    if (height !== undefined)         updateData.height = height;
    if (weight !== undefined)         updateData.weight = weight;
    if (servicePackage !== undefined) updateData.servicePackage = servicePackage;
    if (serviceExpiry !== undefined)  updateData.serviceExpiry = serviceExpiry;
    // 联系信息（#34）
    if (contactPhone    !== undefined) updateData.contactPhone    = contactPhone;
    if (deliveryAddress !== undefined) updateData.deliveryAddress = deliveryAddress;

    if (healthProfile !== undefined) {
      const hp = healthProfile;
      if (hp.bloodType          !== undefined) {
        updateData['healthProfile.bloodType'] = hp.bloodType;
        const { abo, rh } = parseBloodType(hp.bloodType);
        if (abo) updateData['bloodTypeABO'] = abo;
        if (rh)  updateData['bloodTypeRH']  = rh;
      }
      if (hp.allergies          !== undefined) updateData['healthProfile.allergies']          = hp.allergies;
      if (hp.medicalHistory     !== undefined) updateData['healthProfile.medicalHistory']     = hp.medicalHistory;
      if (hp.medications        !== undefined) updateData['healthProfile.medications']        = hp.medications;
      if (hp.familyHistory      !== undefined) updateData['healthProfile.familyHistory']      = hp.familyHistory;
      if (hp.surgeries          !== undefined) updateData['healthProfile.surgeries']          = hp.surgeries;
      if (hp.drugAllergy        !== undefined) updateData['healthProfile.drugAllergy']        = hp.drugAllergy;
      if (hp.foodAllergy        !== undefined) updateData['healthProfile.foodAllergy']        = hp.foodAllergy;
      if (hp.pastHistory        !== undefined) updateData['healthProfile.pastHistory']        = hp.pastHistory;
      if (hp.medicHistory       !== undefined) updateData['healthProfile.medicHistory']       = hp.medicHistory;
      if (hp.surgeryHistory     !== undefined) updateData['healthProfile.surgeryHistory']     = hp.surgeryHistory;
      if (hp.menstrualHistory   !== undefined) updateData['healthProfile.menstrualHistory']   = hp.menstrualHistory;
      if (hp.maritalHistory     !== undefined) updateData['healthProfile.maritalHistory']     = hp.maritalHistory;
      // infectiousHistory 是顶层字段，用户端通过 healthProfile 传入时同步写入
      if (hp.infectiousHistory  !== undefined) updateData['infectiousHistory']                = hp.infectiousHistory;
    }

    // 检测联系信息变更，写入变更日志（#34）
    const changeLogs = [];
    const FIELD_LABELS = { contactPhone: '联系电话', deliveryAddress: '配送地址' };
    for (const field of ['contactPhone', 'deliveryAddress']) {
      if (req.body[field] !== undefined) {
        const oldVal = String(req.user[field] || '');
        const newVal = String(req.body[field] || '');
        if (oldVal !== newVal) {
          changeLogs.push({
            userId:    req.user._id,
            userName:  req.user.name || '',
            userPhone: req.user.phone || '',
            field,
            fieldLabel: FIELD_LABELS[field],
            oldValue:  oldVal,
            newValue:  newVal,
          });
        }
      }
    }

    // 直接用原生 MongoDB driver，完全绕过 Mongoose schema 类型转换
    await User.collection.updateOne(
      { _id: req.user._id },
      { $set: updateData }
    );

    // 异步写变更日志（不阻塞主响应）
    if (changeLogs.length > 0) {
      UserChangeLog.insertMany(changeLogs).catch(e => console.error('变更日志写入失败:', e));
    }

    const user = await User.findById(req.user._id).select('-password');
    res.json({ success: true, data: user });
  } catch (err) {
    console.error('PUT /user/me error:', err);
    res.status(500).json({ success: false, message: '更新用户信息失败', error: err.message });
  }
});

// 完成 Onboarding
router.post('/onboarding', auth, async (req, res) => {
  try {
    const { name, age, gender, height, weight, conditions, smoking, drinking, exercise, familyHistory, medications } = req.body;
    const score = 60 + Math.floor(Math.random() * 25);
    const updateData = {
      healthScore: score,
      onboardingCompleted: true,
    };
    if (name !== undefined)     updateData.name = name;
    if (age !== undefined)      updateData.age = age;
    if (gender !== undefined)   updateData.gender = gender;
    if (height !== undefined)   updateData.height = height;
    if (weight !== undefined)   updateData.weight = weight;
    if (smoking !== undefined)  updateData.smoking = smoking;
    if (drinking !== undefined) updateData.drinking = drinking;
    if (exercise !== undefined) updateData.exercise = exercise;
    if (familyHistory !== undefined) updateData['healthProfile.familyHistory'] = familyHistory;
    const user = await User.findByIdAndUpdate(req.user._id, updateData, { new: true });
    res.json({ success: true, data: { user, healthScore: score } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Onboarding 失败', error: err.message });
  }
});

// 首页汇总数据
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    // 最新各类指标 —— 全部并行查询（原串行 for 循环改为 Promise.all）
    const VITAL_TYPES = ['bloodPressure', 'bloodSugar', 'heartRate', 'weight', 'sleep'];
    const [vitalResults, pendingTasks, allReminders, hasAnyHealthData] = await Promise.all([
      Promise.all(
        VITAL_TYPES.map(type =>
          HealthRecord.findOne({ user: userId, type }).sort({ recordedAt: -1 }).lean()
        )
      ),
      Task.find({ user: userId, status: 'pending' })
        .sort({ priority: 1, createdAt: 1 }).limit(5).lean(),
      Reminder.find({ user: userId, enabled: true }).lean(),
      HealthRecord.countDocuments({ user: userId }),
    ]);

    const latestByType = Object.fromEntries(
      VITAL_TYPES.map((type, i) => [type, vitalResults[i] || null])
    );
    const todayReminders = allReminders.filter(isActiveToday).slice(0, 10);

    // BMI 实时计算：优先使用最新体重 HealthRecord，其次 user.weight
    const latestWeightVal = latestByType.weight ? parseFloat(latestByType.weight.value) : req.user.weight;
    const heightM = req.user.height ? req.user.height / 100 : null;
    const bmi = (heightM && latestWeightVal)
      ? parseFloat((latestWeightVal / (heightM * heightM)).toFixed(1))
      : null;

    // 若无健康评分但已有健康记录，自动计算基础分并持久化
    if (!req.user.healthScore && hasAnyHealthData > 0) {
      const base = 60;
      const recordBonus = Math.min(hasAnyHealthData * 2, 20);
      const calculatedScore = Math.min(100, base + recordBonus);
      await User.findByIdAndUpdate(userId, { $set: { healthScore: calculatedScore } });
      req.user = Object.assign(req.user.toObject ? req.user.toObject() : req.user, { healthScore: calculatedScore });
    }

    // 今日评分打点（同一天不重复写入，最多保留 30 条）
    const today = new Date().toISOString().slice(0, 10);
    const history = req.user.scoreHistory || [];
    if (!history.some(h => h.date === today) && req.user.healthScore > 0) {
      const newHistory = [...history, { score: req.user.healthScore, date: today }]
        .slice(-30);
      await User.findByIdAndUpdate(userId, { $set: { scoreHistory: newHistory } });
    }

    res.json({
      success: true,
      data: {
        user: req.user,
        latestVitals: latestByType,
        pendingTasks,
        todayReminders,
        scoreHistory: history.slice(-14),  // 返回最近 14 天
        has_any_health_data: hasAnyHealthData,
        bmi,               // 基于最新体重记录实时计算
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取仪表板数据失败', error: err.message });
  }
});

// 健康报告
router.get('/report', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = 'week' } = req.query;

    const days = period === 'month' ? 30 : 7;
    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // 格式化日期范围，如 "5/11 - 5/17"
    const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    const dateRange = `${fmt(start)} - ${fmt(now)}`;
    const periodLabel = period === 'month' ? '本月报告' : '本周报告';

    // 查询该期间所有健康记录
    const records = await HealthRecord.find({
      user: userId,
      recordedAt: { $gte: start },
    }).sort({ recordedAt: 1 });

    // 按 type 分组
    const typeMap = {};
    for (const r of records) {
      if (!typeMap[r.type]) typeMap[r.type] = [];
      typeMap[r.type].push(r);
    }

    // 指标元数据
    const META = {
      bloodPressure: { label: '血压', unit: 'mmHg' },
      bloodSugar:    { label: '血糖', unit: 'mmol/L' },
      heartRate:     { label: '心率', unit: 'bpm' },
      weight:        { label: '体重', unit: 'kg' },
    };

    // 血压状态判断（按收缩压）
    function bpStatus(sys) {
      if (sys >= 140) return 'danger';
      if (sys >= 130) return 'warning';
      return 'normal';
    }

    // 通用状态判断
    function metricStatus(type, value, extra) {
      const v = parseFloat(value);
      if (type === 'bloodPressure') {
        const sys = extra?.sys ? parseFloat(extra.sys) : v;
        return bpStatus(sys);
      }
      if (type === 'bloodSugar') {
        if (v >= 7.0 || v < 3.9) return 'danger';
        if (v >= 6.1) return 'warning';
        return 'normal';
      }
      if (type === 'heartRate') {
        if (v > 100 || v < 60) return 'warning';
        return 'normal';
      }
      return 'normal';
    }

    const metrics = [];
    const highlights = [];
    let totalRecordCount = 0;

    for (const [type, recs] of Object.entries(typeMap)) {
      const meta = META[type];
      if (!meta) continue;

      totalRecordCount += recs.length;
      const first = recs[0];
      const last = recs[recs.length - 1];

      let displayValue, delta, trend;

      if (type === 'bloodPressure') {
        // 最新值
        const lastSys = last.extra?.sys ? parseFloat(last.extra.sys) : parseFloat(last.value);
        const lastDia = last.extra?.dia ? parseFloat(last.extra.dia) : null;
        displayValue = lastDia != null ? `${lastSys}/${lastDia}` : String(lastSys);

        // 趋势（收缩压差）
        const firstSys = first.extra?.sys ? parseFloat(first.extra.sys) : parseFloat(first.value);
        const firstDia = first.extra?.dia ? parseFloat(first.extra.dia) : null;
        const deltaSys = Math.round(lastSys - firstSys);
        if (firstDia != null && lastDia != null) {
          const deltaDia = Math.round(lastDia - firstDia);
          delta = `${deltaSys >= 0 ? '+' : ''}${deltaSys}/${deltaDia >= 0 ? '+' : ''}${deltaDia}`;
        } else {
          delta = `${deltaSys >= 0 ? '+' : ''}${deltaSys}`;
        }
        trend = deltaSys < 0 ? 'down' : deltaSys > 0 ? 'up' : 'stable';
      } else {
        const lastV = parseFloat(last.value);
        const firstV = parseFloat(first.value);
        displayValue = String(lastV);
        const d = parseFloat((lastV - firstV).toFixed(2));
        delta = `${d >= 0 ? '+' : ''}${d}`;
        trend = d < 0 ? 'down' : d > 0 ? 'up' : 'stable';
      }

      const status = metricStatus(type, last.value, last.extra);

      metrics.push({
        label: meta.label,
        type,
        value: displayValue,
        unit: meta.unit,
        status,
        trend,
        delta,
        count: recs.length,
      });

      // 生成 highlights
      if (recs.length >= 5) {
        highlights.push({ type: 'good', text: `${periodLabel.replace('报告', '')}共记录${meta.label}${recs.length}次，坚持监测` });
      }
      if (status === 'warning') {
        highlights.push({ type: 'warning', text: `${meta.label}最新值偏高，请注意` });
      } else if (status === 'danger') {
        highlights.push({ type: 'warning', text: `${meta.label}最新值异常，建议就医` });
      }
    }

    // Task 完成情况
    const [totalTasks, completedTasks] = await Promise.all([
      Task.countDocuments({ user: userId, createdAt: { $gte: start } }),
      Task.countDocuments({ user: userId, status: 'completed', createdAt: { $gte: start } }),
    ]);
    const taskRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // 健康评分：从 SystemConfig 读取权重配置
    const scoringCfg = await SystemConfig.findOne({ key: 'health_scoring' }).lean();
    const w = scoringCfg?.value || {};
    const base           = w.base            ?? 60;
    const perRecord      = w.perRecord       ?? 2;
    const maxRecordBonus = w.maxRecordBonus  ?? 20;
    const taskRateWeight = w.taskRateWeight  ?? 0.1;
    const dangerPenalty  = w.dangerPenalty   ?? 10;
    const warningPenalty = w.warningPenalty  ?? 5;

    const dangerCount  = metrics.filter((m) => m.status === 'danger').length;
    const warningCount = metrics.filter((m) => m.status === 'warning').length;
    let healthScore = base;
    healthScore += Math.min(totalRecordCount * perRecord, maxRecordBonus);
    healthScore += Math.round(taskRate * taskRateWeight);
    healthScore -= dangerCount * dangerPenalty + warningCount * warningPenalty;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // 评分明细（供前端展示）
    const scoreBreakdown = {
      base,
      recordBonus: Math.min(totalRecordCount * perRecord, maxRecordBonus),
      taskBonus:   Math.round(taskRate * taskRateWeight),
      dangerDeduct: dangerCount * dangerPenalty,
      warningDeduct: warningCount * warningPenalty,
    };

    // scoreDelta 用随机小幅波动模拟（实际可存历史分）
    const scoreDelta = Math.floor(Math.random() * 7) - 2;

    res.json({
      success: true,
      data: {
        period: periodLabel,
        dateRange,
        healthScore,
        scoreDelta,
        scoreBreakdown,
        recordCount: totalRecordCount,
        taskCompletion: { total: totalTasks, completed: completedTasks, rate: taskRate },
        metrics,
        highlights,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取健康报告失败', error: err.message });
  }
});

// ── 更换手机号 ───────────────────────────────────────────────────

// 存储换绑验证码（内存，演示用）
const changeCodeStore = new Map();

// POST /user/change-phone/send-code — 发验证码到新手机
router.post('/change-phone/send-code', auth, async (req, res) => {
  const { newPhone } = req.body;
  if (!newPhone || !/^1[3-9]\d{9}$/.test(newPhone)) {
    return res.status(400).json({ success: false, message: '请输入正确的手机号' });
  }
  if (newPhone === req.user.phone) {
    return res.status(400).json({ success: false, message: '新手机号不能与当前手机号相同' });
  }
  const exists = await User.findOne({ phone: newPhone });
  if (exists) {
    return res.status(400).json({ success: false, message: '该手机号已被其他账号使用' });
  }

  const code = process.env.NODE_ENV === 'production'
    ? String(Math.floor(100000 + Math.random() * 900000))
    : '123456';

  changeCodeStore.set(`${req.user._id}:${newPhone}`, { code, expiry: Date.now() + 5 * 60 * 1000 });
  // 生产环境验证码通过短信发送，不打印到日志

  res.json({
    success: true,
    message: '验证码已发送',
    ...(process.env.NODE_ENV !== 'production' && { code }),
  });
});

// POST /user/change-phone — 验证并完成换绑
router.post('/change-phone', auth, async (req, res) => {
  const { newPhone, code } = req.body;
  if (!newPhone || !code) {
    return res.status(400).json({ success: false, message: '参数不完整' });
  }

  const key    = `${req.user._id}:${newPhone}`;
  const stored = changeCodeStore.get(key);
  if (!stored || stored.code !== String(code) || Date.now() > stored.expiry) {
    return res.status(400).json({ success: false, message: '验证码错误或已过期' });
  }
  changeCodeStore.delete(key);

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { phone: newPhone } },
    { new: true }
  ).select('-password');

  res.json({ success: true, message: '手机号更换成功', data: user });
});

// ── 创建健康报告分享链接 ────────────────────────────────────────────
// POST /user/report/share
// body: { period, snapshot }  — snapshot 为前端当前报告数据快照
router.post('/report/share', auth, async (req, res) => {
  try {
    const { period = 'week', snapshot } = req.body;
    if (!snapshot) {
      return res.status(400).json({ success: false, message: '缺少报告数据' });
    }

    const token = crypto.randomBytes(8).toString('hex');          // 16 位随机 hex
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);  // 7 天有效

    await ShareToken.create({
      token,
      userId: req.user._id,
      userName: req.user.name || req.user.phone,
      period,
      reportData: snapshot,
      expiresAt,
    });

    const shareUrl = `${FRONTEND_URL}?share=${token}`;
    res.json({ success: true, data: { token, shareUrl, expiresAt } });
  } catch (err) {
    res.status(500).json({ success: false, message: '创建分享链接失败', error: err.message });
  }
});

// GET /api/user/annual-mgmt-plans — 年度管理方案（已推送）
router.get('/annual-mgmt-plans', auth, async (req, res) => {
  try {
    const plans = await AnnualPlan.find({ patientId: req.user._id, pushedAt: { $ne: null } })
      .populate('pushedBy', 'name role title')
      .sort({ year: -1 });
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取年度管理方案失败', error: err.message });
  }
});

// PATCH /api/user/annual-mgmt-plans/:id/confirm — 用户确认年度管理方案
router.patch('/annual-mgmt-plans/:id/confirm', auth, async (req, res) => {
  try {
    const plan = await AnnualPlan.findOne({ _id: req.params.id, patientId: req.user._id });
    if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
    if (!plan.confirmedAt) {
      plan.confirmedAt = new Date();
      await plan.save();
    }
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: '操作失败' });
  }
});

// ── Req 10: 健康方案（医护端创建，用户端展示）────────────────────
// GET /api/user/plans
router.get('/plans', auth, async (req, res) => {
  try {
    const plans = await HealthPlan.find({ patientId: req.user._id, status: { $in: ['active', 'draft'] } })
      .select('title type description items status startDate endDate followupFrequency confirmedAt pushedAt')
      .populate('staffId', 'name role title')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取健康方案失败', error: err.message });
  }
});

// PATCH /api/user/plans/:planId/view — 用户查阅方案，记录已阅时间
router.patch('/plans/:planId/view', auth, async (req, res) => {
  try {
    const plan = await HealthPlan.findOne({ _id: req.params.planId, patientId: req.user._id });
    if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
    if (!plan.viewedAt) {
      plan.viewedAt = new Date();
      await plan.save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: '操作失败' });
  }
});

// PATCH /api/user/plans/:planId/confirm — 用户确认方案（draft → active）
router.patch('/plans/:planId/confirm', auth, async (req, res) => {
  try {
    const plan = await HealthPlan.findOne({ _id: req.params.planId, patientId: req.user._id });
    if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
    if (plan.status !== 'draft') return res.json({ success: true, data: plan }); // 已确认则直接返回
    plan.status = 'active';
    plan.confirmedAt = new Date();
    await plan.save();
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: '操作失败', error: err.message });
  }
});

// PATCH /api/user/plans/:planId/items/:itemId/complete — 用户标记方案项为已完成
router.patch('/plans/:planId/items/:itemId/complete', auth, async (req, res) => {
  try {
    const plan = await HealthPlan.findOne({ _id: req.params.planId, patientId: req.user._id });
    if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
    const item = plan.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, message: '任务项不存在' });
    item.status = 'completed';
    item.completedAt = new Date();
    await plan.save();
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: '操作失败', error: err.message });
  }
});

// ── Req 6 & 12: 权益赠送记录（医护端赠送，用户端查看）──────────
// GET /api/user/gifts
router.get('/gifts', auth, async (req, res) => {
  try {
    const gifts = await GiftRecord.find({ patientId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('staffId', 'name role title');
    res.json({ success: true, data: gifts });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取权益记录失败', error: err.message });
  }
});

// ── Req 10: 随访计划作为用户侧待办任务 ─────────────────────────
// GET /api/user/followup-tasks
router.get('/followup-tasks', auth, async (req, res) => {
  try {
    const followups = await FollowUp.find({
      patientId: req.user._id,
      status: { $in: ['planned', 'in_progress'] },
    })
      .sort({ date: 1 })
      .populate('staffId', 'name role title')
      .populate('assignedTo', 'name role title');
    res.json({ success: true, data: followups });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取随访任务失败', error: err.message });
  }
});

// GET /api/user/push-records — 医护端推送给我的记录（科普/方案/问卷通知等）
router.get('/push-records', auth, async (req, res) => {
  try {
    const records = await PushRecord.find({ patientId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('staffId', 'name role title');
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取推送记录失败', error: err.message });
  }
});

// POST /api/user/push-records/:id/pay — 从推送记录直接下单
router.post('/push-records/:id/pay', auth, async (req, res) => {
  try {
    const record = await PushRecord.findOne({ _id: req.params.id, patientId: req.user._id });
    if (!record) return res.status(404).json({ success: false, message: '推送记录不存在' });
    const { selectedProductIds } = req.body;
    if (!selectedProductIds?.length) return res.status(400).json({ success: false, message: '请选择要购买的产品' });
    // 从 products 数组里找出选中的项
    const toPay = (record.products || []).filter(p => selectedProductIds.includes(p.productId));
    if (!toPay.length) return res.status(400).json({ success: false, message: '所选产品不在推送列表中' });
    const orders = await Order.insertMany(toPay.map(p => ({
      user: req.user._id,
      serviceId: p.productId,
      serviceName: p.name,
      servicePrice: p.price,
      orderType: 'product',
      pushRecordId: record._id,
      status: 'pending',
    })));
    if (!record.readAt) await PushRecord.updateOne({ _id: record._id }, { readAt: new Date() });
    res.json({ success: true, data: orders, message: `已创建 ${orders.length} 个订单` });
  } catch (err) {
    res.status(500).json({ success: false, message: '下单失败', error: err.message });
  }
});

// PATCH /api/user/push-records/:id/read — 标记推送记录已读
router.patch('/push-records/:id/read', auth, async (req, res) => {
  try {
    await PushRecord.findOneAndUpdate(
      { _id: req.params.id, patientId: req.user._id },
      { readAt: new Date() }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: '操作失败', error: err.message });
  }
});

// GET /api/user/checkup-plan — 当前年度复查计划
router.get('/checkup-plan', auth, async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const plan = await CheckupPlan.findOne({ user: req.user._id, year });
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取复查计划失败', error: err.message });
  }
});

// ── 检查开单（用户端） ─────────────────────────────────────────
// GET /api/user/requisitions — 获取自己的开单列表
router.get('/requisitions', auth, async (req, res) => {
  try {
    const reqs = await ExamRequisition.find({ patientId: req.user._id, status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .populate('staffId', 'name role');
    res.json({ success: true, data: reqs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 共享人账户（家庭成员） ────────────────────────────────────────
// GET /api/user/family
router.get('/family', auth, async (req, res) => {
  try {
    const u = await User.findById(req.user._id).select('family');
    res.json({ success: true, data: u?.family || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/family — 添加家庭成员
router.post('/family', auth, async (req, res) => {
  try {
    const { name, relation, phone, birthday, gender, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, message: '姓名不能为空' });
    await User.collection.updateOne(
      { _id: req.user._id },
      { $push: { family: { name, relation: relation || '', phone: phone || '', birthday: birthday || '', gender: gender || '', notes: notes || '' } } }
    );
    const u = await User.findById(req.user._id).select('family');
    res.json({ success: true, data: u.family });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/user/family/:index — 按索引删除家庭成员
router.delete('/family/:index', auth, async (req, res) => {
  try {
    const idx = parseInt(req.params.index);
    const u = await User.findById(req.user._id).select('family');
    if (!u) return res.status(404).json({ success: false, message: '用户不存在' });
    const family = u.family || [];
    if (idx < 0 || idx >= family.length) return res.status(400).json({ success: false, message: '索引无效' });
    family.splice(idx, 1);
    await User.collection.updateOne({ _id: req.user._id }, { $set: { family } });
    res.json({ success: true, data: family });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
