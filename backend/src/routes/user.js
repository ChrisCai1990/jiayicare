const express = require('express');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const User = require('../models/User');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const Reminder = require('../models/Reminder');
const ShareToken = require('../models/ShareToken');
const CheckupPlan = require('../models/CheckupPlan');
const { isActiveToday } = require('./reminders');
const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dist-maowxvion-jiayihui.vercel.app';

// 获取当前用户信息
router.get('/me', auth, async (req, res) => {
  try {
    res.json({ success: true, data: req.user });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取用户信息失败', error: err.message });
  }
});

// 更新用户信息（支持 healthProfile）
router.put('/me', auth, async (req, res) => {
  try {
    const { name, age, gender, height, weight, servicePackage, serviceExpiry, healthProfile } = req.body;

    const updateData = {};
    if (name !== undefined)           updateData.name = name;
    if (age !== undefined)            updateData.age = age;
    if (gender !== undefined)         updateData.gender = gender;
    if (height !== undefined)         updateData.height = height;
    if (weight !== undefined)         updateData.weight = weight;
    if (servicePackage !== undefined) updateData.servicePackage = servicePackage;
    if (serviceExpiry !== undefined)  updateData.serviceExpiry = serviceExpiry;
    if (healthProfile !== undefined) {
      const hp = healthProfile;
      if (hp.bloodType     !== undefined) updateData['healthProfile.bloodType']     = hp.bloodType;
      if (hp.allergies     !== undefined) updateData['healthProfile.allergies']     = hp.allergies;
      if (hp.medicalHistory!== undefined) updateData['healthProfile.medicalHistory']= hp.medicalHistory;
      if (hp.medications   !== undefined) updateData['healthProfile.medications']   = hp.medications;
      if (hp.familyHistory !== undefined) updateData['healthProfile.familyHistory'] = hp.familyHistory;
      if (hp.surgeries     !== undefined) updateData['healthProfile.surgeries']     = hp.surgeries;
      if (hp.drugAllergy   !== undefined) updateData['healthProfile.drugAllergy']   = hp.drugAllergy;
      if (hp.foodAllergy   !== undefined) updateData['healthProfile.foodAllergy']   = hp.foodAllergy;
      if (hp.pastHistory   !== undefined) updateData['healthProfile.pastHistory']   = hp.pastHistory;
      if (hp.medicHistory  !== undefined) updateData['healthProfile.medicHistory']  = hp.medicHistory;
      if (hp.surgeryHistory!== undefined) updateData['healthProfile.surgeryHistory']= hp.surgeryHistory;
    }

    // 直接用原生 MongoDB driver，完全绕过 Mongoose schema 类型转换
    // 这样无论 Railway 上跑的是哪个版本的 User schema，数组字段都能正常写入
    await User.collection.updateOne(
      { _id: req.user._id },
      { $set: updateData }
    );
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

    // 最新各类指标
    const latestByType = {};
    const types = ['bloodPressure', 'bloodSugar', 'heartRate', 'weight', 'sleep'];
    for (const type of types) {
      const record = await HealthRecord.findOne({ user: userId, type }).sort({ recordedAt: -1 });
      latestByType[type] = record || null;
    }

    // 今日待办任务（最多5条）
    const pendingTasks = await Task.find({ user: userId, status: 'pending' })
      .sort({ priority: 1, createdAt: 1 })
      .limit(5);

    // 今日激活的提醒（最多10条）
    const allReminders = await Reminder.find({ user: userId, enabled: true });
    const todayReminders = allReminders.filter(isActiveToday).slice(0, 10);

    // 是否有任何健康数据（用于前端判断新用户空状态）
    const hasAnyHealthData = (await HealthRecord.countDocuments({ user: userId })) > 0;

    // BMI 实时计算：优先使用最新体重 HealthRecord，其次 user.weight
    const latestWeightVal = latestByType.weight ? parseFloat(latestByType.weight.value) : req.user.weight;
    const heightM = req.user.height ? req.user.height / 100 : null;
    const bmi = (heightM && latestWeightVal)
      ? parseFloat((latestWeightVal / (heightM * heightM)).toFixed(1))
      : null;

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

    // 简单健康分数：基础60分 + 记录加分 + 任务加分 - 异常扣分
    let healthScore = 60;
    healthScore += Math.min(totalRecordCount * 2, 20); // 最多加20分
    healthScore += Math.round(taskRate * 0.1);          // 最多加10分
    const dangerCount = metrics.filter((m) => m.status === 'danger').length;
    const warningCount = metrics.filter((m) => m.status === 'warning').length;
    healthScore -= dangerCount * 10 + warningCount * 5;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // scoreDelta 用随机小幅波动模拟（实际可存历史分）
    const scoreDelta = Math.floor(Math.random() * 7) - 2;

    res.json({
      success: true,
      data: {
        period: periodLabel,
        dateRange,
        healthScore,
        scoreDelta,
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

module.exports = router;
