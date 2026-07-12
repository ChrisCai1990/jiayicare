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
const PointsLog    = require('../models/PointsLog');
const HealthPlan   = require('../models/HealthPlan');
const PushRecord   = require('../models/PushRecord');
const Order        = require('../models/Order');
const Coupon       = require('../models/Coupon');
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
    // kind 为固定岗位类型，用于判断"是否配备某岗位"；role 为具体职称，仅用于展示
    userData.careTeam = [
      fdInfo ? { name: fdInfo.name, role: fdInfo.title || '家庭医师', kind: 'familyDoctor' }  : null,
      nsInfo ? { name: nsInfo.name, role: nsInfo.title || '营养师',   kind: 'nutritionist' }  : null,
      hmInfo ? { name: hmInfo.name, role: hmInfo.title || '健管专员', kind: 'healthManager' } : null,
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
            contactPhone, deliveryAddress, healthProfile,
            bloodTypeABO, bloodTypeRH } = req.body;

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
    // 血型独立字段（用户端直接传入 ABO/RH）
    if (bloodTypeABO !== undefined) updateData.bloodTypeABO = bloodTypeABO;
    if (bloodTypeRH  !== undefined) updateData.bloodTypeRH  = bloodTypeRH;

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
      if (hp.familyHistoryNote  !== undefined) updateData['healthProfile.familyHistoryNote']  = hp.familyHistoryNote;
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
// 首次登录最小化建档：姓名+身份证号+联系电话，性别/出生日期由身份证号自动解析
// 其余健康信息（既往史/生活方式/心理健康等）交给问卷库分批推送采集，不在此处重复询问
router.post('/onboarding', auth, async (req, res) => {
  try {
    const { name, idNumber, idType, contactPhone } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: '请填写姓名' });
    if (!contactPhone || !contactPhone.trim()) return res.status(400).json({ success: false, message: '请填写联系电话' });

    // 护照号格式各国不一，不做身份证格式校验也不做性别/生日自动解析；仅身份证号走原有解析逻辑
    const isPassport = idType === 'passport';
    const { parseIdCard } = require('../utils/idCard');
    const parsed = (idNumber && !isPassport) ? parseIdCard(idNumber) : null;
    if (idNumber && !isPassport && !parsed) return res.status(400).json({ success: false, message: '身份证号格式不正确' });

    const updateData = {
      name: name.trim(),
      contactPhone: contactPhone.trim(),
      onboardingCompleted: true,
      onboardingCompletedAt: new Date(),
    };
    if (idNumber) { updateData.idNumber = idNumber; updateData.idType = isPassport ? 'passport' : 'idCard'; }
    if (parsed) {
      updateData.gender = parsed.gender;
      updateData.birthDate = parsed.birthDate;
      updateData.age = parsed.age;
    }
    const user = await User.findByIdAndUpdate(req.user._id, updateData, { new: true });

    // 立即推送第一批问卷（健康问卷表），失败不影响 onboarding 本身完成
    try {
      const { pushBatch1 } = require('../utils/onboardingPush');
      await pushBatch1(req.user._id);
    } catch (e) {
      console.error('[onboarding] 第一批问卷推送失败', e.message);
    }

    res.json({ success: true, data: { user } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Onboarding 失败', error: err.message });
  }
});

// 计算「成长数据」：连续打卡天数 / 近30天累计打卡天数 / 本月打卡日历 / 一条趋势亮点
// 用于首页「成长」卡片，给客户正向反馈以提升打卡留存（增长杠杆②）。
// streak 口径与 dailyCareScheduler 一致：今天或昨天有打卡即续上，断一天归零。
async function buildGrowthData(userId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const records = await HealthRecord.find({ user: userId, recordedAt: { $gte: thirtyDaysAgo } })
    .sort({ recordedAt: 1 }).select('type value recordedAt').lean();

  // 打卡日期集合（YYYY-MM-DD，按本地日切）
  const fmtDay = (d) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };
  const daySet = new Set(records.map(r => fmtDay(r.recordedAt)));

  // 连续打卡天数：从今天往回数，允许今天还没打卡（从昨天续上）
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = fmtDay(new Date(Date.now() - i * 86400000));
    if (daySet.has(d)) streak++;
    else if (i === 0) continue; // 今天还没打卡不算断
    else break;
  }

  // 本月打卡日历：当月每一天是否打卡（供前端画热力/圆点）
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthCalendar = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    monthCalendar.push({ day, checked: daySet.has(d), future: day > now.getDate() });
  }

  // 趋势亮点：睡眠/体重取近30天最早 vs 最新对比，给一条「在变好」的正反馈
  const trendHighlight = (() => {
    // 睡眠评分越高越好，体重朝健康区间靠拢算好；这里优先睡眠时长、其次体重
    const pickTrend = (type, label, unit, betterWhenLower) => {
      const arr = records.filter(r => r.type === type && r.value != null);
      if (arr.length < 2) return null;
      const first = parseFloat(arr[0].value);
      const last = parseFloat(arr[arr.length - 1].value);
      if (isNaN(first) || isNaN(last) || first === last) return null;
      const improved = betterWhenLower ? last < first : last > first;
      if (!improved) return null;
      return { label, from: first, to: last, unit, direction: betterWhenLower ? 'down' : 'up' };
    };
    return pickTrend('sleep', '睡眠时长', '小时', false)
        || pickTrend('weight', '体重', 'kg', true)
        || null;
  })();

  return {
    streak,
    totalCheckinDays: daySet.size,          // 近30天累计打卡天数
    monthCalendar,
    trendHighlight,                          // 可能为 null（数据不足或无改善）
  };
}

// 首页汇总数据
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    // 最新各类指标 —— 全部并行查询（原串行 for 循环改为 Promise.all）
    const VITAL_TYPES = ['bloodPressure', 'bloodSugar', 'heartRate', 'weight', 'sleep'];
    const [vitalResults, pendingTasks, allReminders, hasAnyHealthData, growth] = await Promise.all([
      Promise.all(
        VITAL_TYPES.map(type =>
          HealthRecord.findOne({ user: userId, type }).sort({ recordedAt: -1 }).lean()
        )
      ),
      Task.find({ user: userId, status: 'pending' })
        .sort({ priority: 1, createdAt: 1 }).limit(5).lean(),
      Reminder.find({ user: userId, enabled: true }).lean(),
      HealthRecord.countDocuments({ user: userId }),
      buildGrowthData(userId),
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
        growth,            // 成长数据：连续打卡/累计打卡/本月日历/趋势亮点（增长杠杆②）
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

const { syncAnnualPlanFollowUps } = require('../utils/annualPlanFollowUps');

// 方案类型 → 随访待审核归属角色（体检方案由家庭医生把关，营养方案由营养师把关）
const HEALTH_PLAN_REVIEW_ROLE = { annual_checkup: 'familyDoctor', checkup: 'familyDoctor', nutrition: 'nutritionist' };

// AI体检/营养方案确认后，生成一条初始随访占位提醒对应角色跟进（不同于年度管理方案的周期性批量排期，
// 这类方案没有频率配置，只需在确认时提醒一次即可）
async function generateHealthPlanFollowUp(plan) {
  const reviewRole = HEALTH_PLAN_REVIEW_ROLE[plan.type];
  if (!reviewRole) return 0;
  const typeLabel = plan.type === 'nutrition' ? 'AI营养方案' : 'AI体检方案';
  await FollowUp.create({
    patientId: plan.patientId,
    staffId: plan.staffId,
    date: new Date(Date.now() + 7 * 86400000),
    theme: `${typeLabel}确认后随访 · ${plan.title || ''}`,
    status: 'planned',
    sourceHealthPlanId: plan._id,
    sourceType: 'health_plan',
    aiStatus: 'pending',
    reviewRole,
  });
  return 1;
}

// PATCH /api/user/annual-mgmt-plans/:id/confirm — 用户确认年度管理方案
router.patch('/annual-mgmt-plans/:id/confirm', auth, async (req, res) => {
  try {
    const plan = await AnnualPlan.findOne({ _id: req.params.id, patientId: req.user._id });
    if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
    if (!plan.confirmedAt) {
      plan.confirmedAt = new Date();
      await plan.save();
      // 医护端保存方案时已同步生成过随访占位（见 staff.js PUT /annual-plan），这里仅兜底：
      // 万一某条方案是老数据、保存时还没有这套逻辑，用户确认时补一次
      await syncAnnualPlanFollowUps(plan).catch(() => {});
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
    const plans = await HealthPlan.find({
      patientId: req.user._id,
      status: { $in: ['active', 'draft'] },
      'content.aiStatus': { $ne: 'pending' },
    })
      .select('title type description content items status startDate endDate followupFrequency confirmedAt pushedAt notes year')
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

// PATCH /api/user/plans/:planId/confirm — 用户确认方案
router.patch('/plans/:planId/confirm', auth, async (req, res) => {
  try {
    const plan = await HealthPlan.findOne({ _id: req.params.planId, patientId: req.user._id });
    if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
    if (plan.confirmedAt) return res.json({ success: true, data: plan }); // 已确认则直接返回
    if (plan.status === 'draft') plan.status = 'active';
    plan.confirmedAt = new Date();
    await plan.save();
    // 首次确认时，AI体检/营养方案自动生成一条待审核随访占位（体检→家庭医生审核，营养→营养师审核）
    await generateHealthPlanFollowUp(plan).catch(() => {});
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

// ── 积分：账户余额 + 流水（打卡/消费获得，兑换消耗待后续） ─────────
// GET /api/user/points
router.get('/points', auth, async (req, res) => {
  try {
    const logs = await PointsLog.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: { balance: req.user.pointsBalance || 0, logs } });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取积分记录失败', error: err.message });
  }
});

// ── Req 10: 随访计划作为用户侧待办任务 ─────────────────────────
// GET /api/user/followup-tasks
router.get('/followup-tasks', auth, async (req, res) => {
  try {
    const followups = await FollowUp.find({
      patientId: req.user._id,
      $or: [
        { status: { $in: ['planned', 'in_progress', 'missed', 'completed', 'cancelled'] } }, // 已取消也要展示，供用户端"已取消"筛选查看
        { completedByUser: true },
      ],
    })
      .sort({ date: 1 })
      .populate('staffId', 'name role title')
      .populate('assignedTo', 'name role title')
      .populate({ path: 'followUpSchemeId', populate: { path: 'formId' } });
    res.json({ success: true, data: followups });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取随访任务失败', error: err.message });
  }
});

// PATCH /api/user/followup-tasks/:id/done — 用户标记/取消随访任务已完成
// needFollowUp: true  → 用户表示"仍需健管专员跟进"，保持 status=planned，进入医护端"待随访"队列，不算完成
//   （此前误写为 status=in_progress，但医护端工作台"待随访任务"面板只查 planned，
//   导致这类"用户明确要求跟进"的记录反而从健管专员视野里消失，2026-07-13 修复）
// needFollowUp: false（默认）→ 用户确认"不需要跟进"，直接 status=completed + completedBy=user，闭环
router.patch('/followup-tasks/:id/done', auth, async (req, res) => {
  try {
    const followup = await FollowUp.findOne({ _id: req.params.id, patientId: req.user._id });
    if (!followup) return res.status(404).json({ success: false, message: '随访任务不存在' });
    const done = req.body.done !== false; // 默认 true，传 false 则取消
    const needFollowUp = req.body.needFollowUp === true;

    followup.completedByUser = done;
    followup.completedByUserAt = done ? new Date() : null;

    if (done) {
      if (needFollowUp) {
        // 用户表示还需要人工跟进：保持/回退为 planned，留在医护端"待随访"队列，不算完成
        if (followup.status !== 'completed' && followup.status !== 'cancelled') followup.status = 'planned';
      } else {
        // 用户确认不需要跟进：直接闭环为已完成
        followup.status = 'completed';
        followup.completedBy = 'user';
        followup.completedAt = new Date();
      }
    } else {
      // 取消标记：仅撤销用户自己标记的完成，不影响健管专员执行完成的记录
      if (followup.status === 'completed' && followup.completedBy === 'user') {
        followup.status = 'planned';
        followup.completedBy = null;
      }
    }

    await followup.save();
    res.json({ success: true, data: followup });
  } catch (err) {
    res.status(500).json({ success: false, message: '操作失败', error: err.message });
  }
});

// POST /api/user/followup-tasks/:id/form — 用户提交随访表单
router.post('/followup-tasks/:id/form', auth, async (req, res) => {
  try {
    const followup = await FollowUp.findOne({ _id: req.params.id, patientId: req.user._id });
    if (!followup) return res.status(404).json({ success: false, message: '随访记录不存在' });
    followup.formData = req.body.formData;
    await followup.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: '提交失败', error: err.message });
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
// useHealthFund: 抵扣的健康基金金额（作用于勾选产品合计）；couponId: 使用的优惠券；paymentMethod: 支付方式
router.post('/push-records/:id/pay', auth, async (req, res) => {
  try {
    const record = await PushRecord.findOne({ _id: req.params.id, patientId: req.user._id });
    if (!record) return res.status(404).json({ success: false, message: '推送记录不存在' });
    const { selectedProductIds, useHealthFund, couponId, paymentMethod } = req.body;
    if (!selectedProductIds?.length) return res.status(400).json({ success: false, message: '请选择要购买的产品' });
    // 从 products 数组里找出选中的项
    const toPay = (record.products || []).filter(p => selectedProductIds.includes(p.productId));
    if (!toPay.length) return res.status(400).json({ success: false, message: '所选产品不在推送列表中' });

    const totalPrice = toPay.reduce((s, p) => s + (p.price || 0), 0);

    // ── 健康基金 + 优惠券抵扣（作用于勾选产品合计，按价格占比分摊到各订单）──
    let coupon = null;
    let couponDiscount = 0;
    if (couponId) {
      coupon = await Coupon.findOne({ _id: couponId, patientId: req.user._id, status: 'active' });
      if (!coupon) return res.status(400).json({ success: false, message: '优惠券不可用或已使用' });
      if (coupon.validTo && new Date(coupon.validTo) < new Date()) {
        return res.status(400).json({ success: false, message: '优惠券已过期' });
      }
      if (coupon.minSpend && totalPrice < coupon.minSpend) {
        return res.status(400).json({ success: false, message: `订单需满 ¥${coupon.minSpend} 才能使用此券` });
      }
      couponDiscount = coupon.type === 'amount' ? coupon.value : Math.round(totalPrice * (100 - coupon.value)) / 100;
      couponDiscount = Math.min(couponDiscount, totalPrice);
    }
    const priceAfterCoupon = Math.max(0, Math.round((totalPrice - couponDiscount) * 100) / 100);

    let fundUsed = 0;
    if (useHealthFund > 0) {
      const balance = req.user.healthFundBalance || 0;
      if (useHealthFund > balance) return res.status(400).json({ success: false, message: '健康基金余额不足' });
      fundUsed = Math.min(useHealthFund, priceAfterCoupon);
    }
    const finalPrice = Math.max(0, Math.round((priceAfterCoupon - fundUsed) * 100) / 100);
    const totalDiscount = couponDiscount + fundUsed;

    // 按各产品价格占比分摊抵扣，得到每个订单的实付金额（最后一项吸收舍入误差）
    let allocated = 0;
    const orderDocs = toPay.map((p, idx) => {
      const share = totalPrice > 0 ? (p.price || 0) / totalPrice : 0;
      let paid = idx === toPay.length - 1
        ? Math.max(0, Math.round((finalPrice - allocated) * 100) / 100)
        : Math.round((p.price || 0) * (1 - totalDiscount / (totalPrice || 1)) * 100) / 100;
      paid = Math.max(0, paid);
      allocated += paid;
      return {
        user: req.user._id,
        serviceId: p.productId,
        serviceName: p.name,
        servicePrice: p.price,
        orderType: 'product',
        pushRecordId: record._id,
        status: 'pending',
        paymentMethod: fundUsed > 0 && finalPrice === 0 ? 'healthFund' : (paymentMethod || ''),
        paidAmount: paid,
      };
    });

    const orders = await Order.insertMany(orderDocs);

    const followUps = [];
    if (!record.readAt) followUps.push(PushRecord.updateOne({ _id: record._id }, { readAt: new Date() }));
    if (fundUsed > 0) {
      followUps.push(User.collection.updateOne({ _id: req.user._id }, { $inc: { healthFundBalance: -fundUsed } }));
    }
    if (coupon) {
      coupon.status = 'used';
      coupon.usedAt = new Date();
      coupon.usedOrderId = orders[0]._id;
      followUps.push(coupon.save());
    }
    await Promise.all(followUps);

    res.json({
      success: true,
      data: orders,
      message: `已创建 ${orders.length} 个订单`,
      summary: { totalPrice, couponDiscount, fundUsed, finalPrice },
    });
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
    if (isNaN(idx)) return res.status(400).json({ success: false, message: '索引无效' });
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

// ── 系统内家庭成员关联（需求6/18）──────────────────────────────────
// GET /api/user/family-links — 获取已关联的家庭成员
router.get('/family-links', auth, async (req, res) => {
  try {
    const u = await User.findById(req.user._id)
      .populate('familyLinks.linkedUser', 'name phone gender birthDate')
      .select('familyLinks');
    const links = (u?.familyLinks || []).map(l => ({
      _id: l._id,
      relation: l.relation,
      createdAt: l.createdAt,
      user: l.linkedUser ? {
        _id: l.linkedUser._id,
        name: l.linkedUser.name,
        phone: l.linkedUser.phone,
        gender: l.linkedUser.gender,
        age: l.linkedUser.birthDate
          ? Math.floor((Date.now() - new Date(l.linkedUser.birthDate)) / (365.25 * 86400000))
          : null,
      } : null,
    })).filter(l => l.user);
    res.json({ success: true, data: links });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/user/family-links/search?q=手机号或姓名 — 搜索已注册用户
router.get('/family-links/search', auth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });
    const query = {
      _id: { $ne: req.user._id },
      $or: [
        { phone: { $regex: q, $options: 'i' } },
        { name:  { $regex: q, $options: 'i' } },
      ],
    };
    const users = await User.find(query).select('name phone gender birthDate').limit(10);
    const alreadyLinked = new Set(
      (await User.findById(req.user._id).select('familyLinks')).familyLinks.map(l => String(l.linkedUser))
    );
    res.json({ success: true, data: users.map(u => ({
      _id: u._id,
      name: u.name,
      phone: u.phone,
      gender: u.gender,
      age: u.birthDate ? Math.floor((Date.now() - new Date(u.birthDate)) / (365.25 * 86400000)) : null,
      alreadyLinked: alreadyLinked.has(String(u._id)),
    })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/family-links — 向已注册用户发送家庭成员邀请（需确认）
router.post('/family-links', auth, async (req, res) => {
  try {
    const { linkedUserId, relation } = req.body;
    if (!linkedUserId) return res.status(400).json({ success: false, message: '请选择要关联的用户' });
    if (String(linkedUserId) === String(req.user._id)) return res.status(400).json({ success: false, message: '不能关联自己' });

    const [userA, userB] = await Promise.all([
      User.findById(req.user._id).select('familyLinks familyInvites name'),
      User.findById(linkedUserId).select('familyLinks familyInvites name'),
    ]);
    if (!userB) return res.status(404).json({ success: false, message: '用户不存在' });
    if (userA.familyLinks.find(l => String(l.linkedUser) === String(linkedUserId))) {
      return res.status(400).json({ success: false, message: '已是家庭成员' });
    }
    // 检查是否已有待处理邀请
    const hasExistingInvite = (userB.familyInvites || []).find(
      inv => String(inv.fromUser) === String(req.user._id) && inv.status === 'pending'
    );
    if (hasExistingInvite) {
      return res.status(400).json({ success: false, message: '已发送过邀请，等待对方确认' });
    }

    if (!userB.familyInvites) userB.familyInvites = [];
    userB.familyInvites.push({
      fromUser: req.user._id,
      fromName: req.user.name || req.user.phone,
      relation: relation || '',
      status: 'pending',
    });
    await userB.save();

    // 取回刚 push 的这条邀请，拿到它的 _id，供消息里直接带操作入口
    const savedInvite = userB.familyInvites[userB.familyInvites.length - 1];

    // 发送系统消息通知被邀请方，带 action 让消息中心直接渲染「去确认」按钮，不依赖用户自己找入口
    const senderName = req.user.name || req.user.phone;
    const relationText = relation ? `（${relation}）` : '';
    await Message.create({
      user:    linkedUserId,
      type:    'system',
      sender:  '系统通知',
      title:   '家庭成员邀请',
      content: `${senderName} 邀请您成为家庭成员${relationText}，点击下方「去确认」即可接受或拒绝。`,
      unread:  true,
      action:  { type: 'family_invite', inviteId: String(savedInvite?._id || ''), route: 'FamilyMembers' },
    });

    res.json({ success: true, message: `邀请已发送，等待 ${userB.name} 确认` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/user/family-links/pending-invites — 查看收到的待确认邀请
router.get('/family-links/pending-invites', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('familyInvites');
    const pending = (user?.familyInvites || [])
      .filter(inv => inv.status === 'pending')
      .map(inv => ({
        _id: inv._id,
        fromUser: inv.fromUser,
        fromName: inv.fromName,
        relation: inv.relation,
        createdAt: inv.createdAt,
      }));
    res.json({ success: true, data: pending });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/user/family-links/invites/:inviteId/accept — 接受邀请
router.patch('/family-links/invites/:inviteId/accept', auth, async (req, res) => {
  try {
    const userB = await User.findById(req.user._id).select('familyLinks familyInvites name');
    const invite = userB.familyInvites.id(req.params.inviteId);
    if (!invite || invite.status !== 'pending') {
      return res.status(404).json({ success: false, message: '邀请不存在或已处理' });
    }
    const userA = await User.findById(invite.fromUser).select('familyLinks name');
    if (!userA) return res.status(404).json({ success: false, message: '邀请方用户不存在' });

    invite.status = 'accepted';
    // A 邀请时填的 relation 语义是"B 是 A 的 X"（如 A 选"父亲"表示 B 是 A 的父亲）。
    // 接受方 B 可在 accept 时传 relation 覆盖"A 是 B 的什么"；未传则按亲属关系自动推导反向称谓。
    const REVERSE_RELATION = {
      '配偶': '配偶', '兄弟': '兄弟姐妹', '姐妹': '兄弟姐妹',
      '父亲': '子女', '母亲': '子女', '子女': '父母',
      '祖父': '孙辈', '祖母': '孙辈',
    };
    const bRelationToA = invite.relation || '';                       // A 视角：B 是 A 的什么
    const aRelationToB = (req.body.relation || REVERSE_RELATION[invite.relation] || '').trim(); // B 视角：A 是 B 的什么
    // 双向建立关联
    if (!userA.familyLinks.find(l => String(l.linkedUser) === String(req.user._id))) {
      userA.familyLinks.push({ linkedUser: req.user._id, relation: bRelationToA });
    }
    if (!userB.familyLinks.find(l => String(l.linkedUser) === String(invite.fromUser))) {
      userB.familyLinks.push({ linkedUser: invite.fromUser, relation: aRelationToB });
    }
    await Promise.all([userA.save(), userB.save()]);
    res.json({ success: true, message: '已接受邀请，家庭成员关联成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/user/family-links/invites/:inviteId/reject — 拒绝邀请
router.patch('/family-links/invites/:inviteId/reject', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('familyInvites');
    const invite = user.familyInvites.id(req.params.inviteId);
    if (!invite || invite.status !== 'pending') {
      return res.status(404).json({ success: false, message: '邀请不存在或已处理' });
    }
    invite.status = 'rejected';
    await user.save();
    res.json({ success: true, message: '已拒绝邀请' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/user/family-links/:linkId — 解除家庭成员关联（双向）
router.delete('/family-links/:linkId', auth, async (req, res) => {
  try {
    const userA = await User.findById(req.user._id).select('familyLinks');
    const link = userA.familyLinks.id(req.params.linkId);
    if (!link) return res.status(404).json({ success: false, message: '关联不存在' });
    const linkedUserId = link.linkedUser;
    userA.familyLinks.pull(req.params.linkId);

    const userB = await User.findById(linkedUserId).select('familyLinks');
    if (userB) {
      const reverse = userB.familyLinks.find(l => String(l.linkedUser) === String(req.user._id));
      if (reverse) userB.familyLinks.pull(reverse._id);
      await userB.save();
    }
    await userA.save();
    res.json({ success: true, message: '已解除家庭成员关联' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 用户端 AI 汇总分析 / 风险评估：按是否配备家庭医生分流 ──────────────
// 有家庭医生（assignedFamilyDoctor 非空）：客户可自助点击生成草稿，标记为待审核；
//   生成后立即可见（草稿态），走医护端 getAiTodos 审核队列，家医审核通过后状态变为已审核
// 无家庭医生：客户可自助点击生成，免审核直接查看AI原始结果（source标记为self_service，
//   不计入 staff.js getAiTodos 的家庭医生待审核队列，避免误入人工审核工作流）
const { generateHealthSummarySections } = require('../utils/aiHealthSummary');
const { generateRiskAssessment } = require('../utils/aiRiskAssessment');

// GET /api/user/ai-health-summary — 查看AI健康汇总分析（有家医时草稿也可见，附带审核状态）
router.get('/ai-health-summary', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('assignedFamilyDoctor aiHealthSummary');
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    const hasDoctor = !!user.assignedFamilyDoctor;
    const data = user.aiHealthSummary || {};
    // 5维度(医疗)与生活方式评估各自独立审核：家医审5维度写doctorApprovedAt，营养师审生活方式写nutritionApprovedAt。
    // 用户端要分开展示两部分的审核状态，不能只看顶层 approvedAt（否则家医审了、营养师没审时会笼统显示"草稿待审"）。
    const isSelfService = data.source === 'self_service';
    const hasSections = !!(data.sections && Object.keys(data.sections).length);
    const hasLifestyle = !!(data.sections && data.sections.lifestyle_assessment &&
      Array.isArray(data.sections.lifestyle_assessment.items) && data.sections.lifestyle_assessment.items.length);
    const reviewStatus = {
      doctorApproved: !!data.doctorApprovedAt,      // 5维度已被家医审核
      nutritionApproved: !!data.nutritionApprovedAt, // 生活方式已被营养师审核
      hasLifestyle,
      isSelfService,
    };
    if (hasDoctor && hasSections && !isSelfService) {
      return res.json({
        success: true, data, hasDoctor, reviewStatus,
        // 兼容旧前端：只要还有任一部分未审就置 pendingReview
        pendingReview: !data.doctorApprovedAt || (hasLifestyle && !data.nutritionApprovedAt),
      });
    }
    res.json({ success: true, data, hasDoctor, reviewStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/ai-health-summary — 客户自助生成
// 有家庭医生：生成待审核草稿（复用医护端同款生成逻辑，进入 getAiTodos 审核队列）
// 无家庭医生：免审核直接生效
router.post('/ai-health-summary', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

    // 已被审核的版本，客户端不能再重新生成覆盖。关键：审核是分部分的（家医审5维度写doctorApprovedAt、
    // 营养师审生活方式写nutritionApprovedAt），而客户端生成是【整份覆盖】——只要任一部分已审，重新生成就会
    // 抹掉那部分的审核成果并产出与已审结果不同的内容。所以按部分判断：任一部分已审即拦截（不能只看顶层approvedAt，
    // 否则家医审了但营养师没审时 approvedAt=null 拦不住，正是金娟反馈"家医已审客户端仍能生成"的根因）。self_service不受限。
    const existingSummary = user.aiHealthSummary || {};
    const anyReviewed = (existingSummary.doctorApprovedAt || existingSummary.nutritionApprovedAt || existingSummary.approvedAt);
    if (anyReviewed && existingSummary.source !== 'self_service') {
      return res.status(409).json({ success: false, code: 'ALREADY_REVIEWED', message: '当前分析已由您的健康管理团队审核确认，如需更新请联系您的健康管理师' });
    }

    // 无家庭医生团队的客户，自助生成每年限1次（硬性限制，不论本次结果后续是否被认为无效，均不可当年再生）
    const hasDoctorPre = !!user.assignedFamilyDoctor;
    const curYear = String(new Date().getFullYear());
    if (!hasDoctorPre && existingSummary.byYear?.[curYear]?.source === 'self_service') {
      return res.status(429).json({ success: false, code: 'YEARLY_LIMIT_REACHED', message: '今年已生成过AI健康分析（每年限1次），如需更新请联系客服升级家庭医生团队服务' });
    }

    const { sections, failed } = await generateHealthSummarySections(user);
    if (failed) return res.status(500).json({ success: false, message: 'AI生成失败，请重试' });
    const year = String(new Date().getFullYear());
    const existing = user.aiHealthSummary || {};
    const byYear = { ...(existing.byYear || {}) };
    const now = new Date();
    const hasDoctor = !!user.assignedFamilyDoctor;

    let summary;
    if (hasDoctor) {
      // 待审核草稿：不置 approvedAt，走家医审核流程（与医护端生成的结构一致，便于 getAiTodos 捕获）
      byYear[year] = { sections, generatedAt: now, approvedAt: null, approvedBy: null, doctorApprovedAt: null, doctorApprovedBy: null, nutritionApprovedAt: null, nutritionApprovedBy: null };
      summary = { sections, generatedAt: now, approvedAt: null, approvedBy: null, doctorApprovedAt: null, doctorApprovedBy: null, nutritionApprovedAt: null, nutritionApprovedBy: null, byYear, latestYear: year };
    } else {
      // 自助模式免审核：approvedAt 直接置位，source 标记 self_service 供下游（getAiTodos等）识别排除
      byYear[year] = { sections, generatedAt: now, approvedAt: now, approvedBy: null, source: 'self_service' };
      summary = { sections, generatedAt: now, approvedAt: now, approvedBy: null, source: 'self_service', byYear, latestYear: year };
    }

    await User.collection.updateOne(
      { _id: user._id },
      { $set: { aiHealthSummary: summary } }
    );
    res.json({ success: true, data: summary, pendingReview: hasDoctor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 兼容旧数据：早期版本 aiRiskAssessment 是单个扁平对象，无 byYear（与 staff.js 的 riskByYear 保持同一迁移口径）
function riskByYearUser(raw) {
  if (!raw) return {};
  if (raw.byYear) return raw.byYear;
  if (raw.dimensions || raw.overallLevel) {
    const y = String(raw.generatedAt ? new Date(raw.generatedAt).getFullYear() : new Date().getFullYear());
    return { [y]: raw };
  }
  return {};
}

// GET /api/user/ai-risk-assessment — 查看AI风险评估（有家医时草稿也可见，附带审核状态）
// 医护端审核是按年度写入 aiRiskAssessment.byYear.{year}.approvedAt 的（staff.js），此前这里只读顶层扁平
// 字段，家医审核后用户端仍显示"待审核"，是两端数据结构不一致导致的展示bug。改为取最新年度的记录来判断。
router.get('/ai-risk-assessment', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('assignedFamilyDoctor aiRiskAssessment');
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    const hasDoctor = !!user.assignedFamilyDoctor;
    const byYear = riskByYearUser(user.aiRiskAssessment);
    const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));
    const latestYear = years[0];
    const data = latestYear ? byYear[latestYear] : {};
    if (hasDoctor && Array.isArray(data.dimensions) && data.dimensions.length && !data.approvedAt) {
      return res.json({ success: true, data, hasDoctor, pendingReview: true, message: '草稿已生成，待家庭医生团队审核' });
    }
    res.json({ success: true, data, hasDoctor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/user/ai-risk-assessment — 客户自助生成
// 有家庭医生：生成待审核草稿；无家庭医生：免审核直接生效
router.post('/ai-risk-assessment', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('name gender age chronicDiseases healthProfile labValues lifestyle assignedFamilyDoctor aiRiskAssessment');
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

    const year = String(new Date().getFullYear());
    const byYear = riskByYearUser(user.aiRiskAssessment);
    const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));
    const existingRisk = years.length ? byYear[years[0]] : {};

    // 已由家庭医生团队审核通过的版本，客户端不能再重新生成覆盖。（2026-07-10 金娟反馈①）
    if (existingRisk.approvedAt && existingRisk.source !== 'self_service') {
      return res.status(409).json({ success: false, code: 'ALREADY_REVIEWED', message: '当前风险评估已由您的健康管理团队审核确认，如需更新请联系您的健康管理师' });
    }

    // 无家庭医生团队的客户，自助生成每年限1次（硬性限制，不论本次结果后续是否被认为无效，均不可当年再生）
    const hasDoctorPre = !!user.assignedFamilyDoctor;
    if (!hasDoctorPre && byYear[year]?.source === 'self_service') {
      return res.status(429).json({ success: false, code: 'YEARLY_LIMIT_REACHED', message: '今年已生成过AI风险评估（每年限1次），如需更新请联系客服升级家庭医生团队服务' });
    }

    const assessment = await generateRiskAssessment(user);
    const hasDoctor = !!user.assignedFamilyDoctor;
    if (hasDoctor) {
      assessment.approvedAt = null; // 待家医审核
    } else {
      assessment.approvedAt = new Date(); // 自助模式免审核
      assessment.source = 'self_service';
    }

    // 写入 byYear，不再整体覆盖 aiRiskAssessment（此前直接 $set 顶层对象会把医护端已有的其他年度数据连根拔起）
    await User.collection.updateOne(
      { _id: user._id },
      { $set: { [`aiRiskAssessment.byYear.${year}`]: assessment } }
    );
    res.json({ success: true, data: assessment, pendingReview: hasDoctor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
