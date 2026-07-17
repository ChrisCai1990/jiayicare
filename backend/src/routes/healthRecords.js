const express = require('express');
const auth = require('../middleware/auth');
const HealthRecord = require('../models/HealthRecord');
const FollowUp = require('../models/FollowUp');
const User = require('../models/User');
const PointsLog = require('../models/PointsLog');
const { calcStatus } = require('../utils/healthRecordStatus');
const router = express.Router();

// 打卡固定积分：每种打卡类型每天（CST）限计一次，防刷分
const CHECKIN_POINTS = 5;
async function awardCheckinPoints(userId, type, recordedAt) {
  try {
    const CST_OFFSET = 8 * 60 * 60 * 1000;
    const now = new Date();
    // 只有录入日期就是今天（CST）才算真实打卡，历史补录（recordedAt 指向过去）不给分，防止批量导入刷分
    const nowCST = new Date(now.getTime() + CST_OFFSET);
    const todayStr = nowCST.toISOString().slice(0, 10);
    const recCST = new Date(recordedAt.getTime() + CST_OFFSET);
    const recDateStr = recCST.toISOString().slice(0, 10);
    if (recDateStr !== todayStr) return;

    const todayStart = new Date(todayStr + 'T00:00:00+08:00');
    const todayEnd   = new Date(todayStr + 'T23:59:59.999+08:00');
    const already = await PointsLog.findOne({
      user: userId, source: 'checkin', refType: type,
      createdAt: { $gte: todayStart, $lte: todayEnd },
    });
    if (already) return;

    await Promise.all([
      User.collection.updateOne({ _id: userId }, { $inc: { pointsBalance: CHECKIN_POINTS } }),
      PointsLog.create({ user: userId, amount: CHECKIN_POINTS, source: 'checkin', refType: type, remark: `${type} 打卡` }),
    ]);
  } catch { /* 不阻断主流程 */ }
}

// ── 健康评分计算（需求1）──────────────────────────────────────────
async function recalcHealthScore(userId) {
  try {
    const [user, recentRecords] = await Promise.all([
      User.findById(userId),
      HealthRecord.find({
        user: userId,
        recordedAt: { $gte: new Date(Date.now() - 30 * 86400000) },
      }).sort({ recordedAt: -1 }),
    ]);
    if (!user) return;

    let score = 100;

    // 血压维度（-15）
    const bpRec = recentRecords.find(r => r.type === 'bloodPressure');
    if (bpRec) {
      const sys = bpRec.extra?.sys || parseFloat(String(bpRec.value).split('/')[0]) || 0;
      if (sys >= 160)      score -= 15;
      else if (sys >= 140) score -= 10;
      else if (sys >= 130) score -= 5;
      else if (sys < 90)   score -= 5;
    }

    // 血糖维度（-15）
    const bsRec = recentRecords.find(r => r.type === 'bloodSugar');
    if (bsRec) {
      const v = parseFloat(bsRec.value);
      if (v >= 11.1)     score -= 15;
      else if (v >= 7.0) score -= 10;
      else if (v >= 6.1) score -= 5;
      else if (v < 3.9)  score -= 10;
    }

    // BMI 维度（体重 + 身高）（-10）
    const wRec = recentRecords.find(r => r.type === 'weight');
    const h = user.height || 0;
    if (wRec && h > 0) {
      const bmi = parseFloat(wRec.value) / ((h / 100) ** 2);
      if (bmi >= 30)         score -= 10;
      else if (bmi >= 28)    score -= 5;
      else if (bmi < 18.5)   score -= 5;
    }

    // 睡眠维度（-10）
    const sleepRec = recentRecords.find(r => r.type === 'sleep');
    if (sleepRec) {
      const h = parseFloat(sleepRec.value);
      if (h < 5)      score -= 10;
      else if (h < 7) score -= 5;
    }

    // 运动打卡加分（近30天3次+）
    const exerciseCount = recentRecords.filter(r => r.type === 'exercise').length;
    if (exerciseCount >= 10) score += 5;
    else if (exerciseCount >= 3) score += 3;

    // 慢病扣分（-15上限）
    const diseases = user.chronicDiseases || [];
    score -= Math.min(diseases.length * 3, 15);

    // 吸烟/饮酒（生活方式打卡）
    const smokingCount = recentRecords.filter(r => r.type === 'smoking').length;
    const alcoholCount = recentRecords.filter(r => r.type === 'alcohol').length;
    if (smokingCount > 0) score -= 5;
    if (alcoholCount > 0) score -= 3;

    score = Math.max(40, Math.min(100, Math.round(score)));

    // 持久化 + 更新评分历史
    const today = new Date().toISOString().slice(0, 10);
    let history = user.scoreHistory || [];
    history = history.filter(h => h.date !== today);
    history = [...history, { score, date: today }].slice(-30);

    await User.findByIdAndUpdate(userId, { $set: { healthScore: score, scoreHistory: history } });
  } catch { /* 不阻断主流程 */ }
}

// 获取记录列表（支持按类型/时间筛选）
router.get('/', auth, async (req, res) => {
  try {
    const { type, category, days } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const page  = Math.max(parseInt(req.query.page) || 1, 1);
    const query = { user: req.user._id };

    if (type) query.type = type;
    if (category) query.category = category;
    if (days) {
      const d = Math.min(Math.max(parseInt(days) || 30, 1), 365);
      query.recordedAt = { $gte: new Date(Date.now() - d * 24 * 60 * 60 * 1000) };
    }

    const records = await HealthRecord.find(query)
      .sort({ recordedAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);

    const total = await HealthRecord.countDocuments(query);
    res.json({ success: true, data: records, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取记录失败', error: err.message });
  }
});

// 获取某类型趋势数据（用于图表）
router.get('/trend/:type', auth, async (req, res) => {
  try {
    const { type } = req.params;
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);

    const records = await HealthRecord.find({
      user: req.user._id,
      type,
      recordedAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    }).sort({ recordedAt: 1 }).limit(60);

    res.json({ success: true, data: records });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取趋势数据失败', error: err.message });
  }
});

// 新增记录
router.post('/', auth, async (req, res) => {
  try {
    const { category, type, label, value, unit, extra, note, recordedAt } = req.body;

    if (!type || value === undefined || value === null || value === '') {
      return res.status(400).json({ success: false, message: '类型和数值不能为空' });
    }

    // category 兼容中英文，默认归为 vitals
    const resolvedCategory = category || 'vitals';

    // 自动判断状态
    const status = calcStatus(type, value, extra);

    // AI监测异常升级（试点：血压danger级自动进入家庭医生待审核队列）
    const aiAlertStatus = (type === 'bloodPressure' && status === 'danger') ? 'pending' : null;

    const record = await HealthRecord.create({
      user: req.user._id,
      category: resolvedCategory,
      type,
      label: label || type,
      value: String(value),
      unit: unit || '',
      extra: extra || {},
      status,
      note: note || '',
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      aiAlertStatus,
    });

    // 打卡后自动同步随访计划状态：找今日（CST UTC+8）含该 checkIn 类型的随访，更新为 completed
    try {
      // 用 UTC+8 算今日边界，避免服务器时区误差
      const CST_OFFSET = 8 * 60 * 60 * 1000;
      const nowCST  = new Date(Date.now() + CST_OFFSET);
      const dateStr = nowCST.toISOString().split('T')[0]; // YYYY-MM-DD (CST)
      // 今日 00:00 ~ 23:59:59 (CST) 转为 UTC 存入 MongoDB
      const todayStart = new Date(dateStr + 'T00:00:00+08:00');
      const todayEnd   = new Date(dateStr + 'T23:59:59.999+08:00');
      const matched = await FollowUp.find({
        patientId: req.user._id,
        status: { $in: ['planned', 'in_progress'] },
        date: { $gte: todayStart, $lte: todayEnd },
        checkInItems: type,
      });
      if (matched.length > 0) {
        const ids = matched.map(f => f._id);
        await FollowUp.updateMany({ _id: { $in: ids } }, { $set: { status: 'completed', completedAt: new Date() } });

        // 若有 repeatDaily=true 的随访，为明天自动创建 planned 记录
        const tomorrowStr = new Date(Date.now() + CST_OFFSET + 86400000).toISOString().split('T')[0];
        const tomorrowDate = new Date(tomorrowStr + 'T08:00:00+08:00');
        for (const fu of matched.filter(f => f.repeatDaily)) {
          // 检查明天是否已存在同一患者同一 checkInItems 的 planned 记录
          const exists = await FollowUp.findOne({
            patientId: fu.patientId,
            staffId: fu.staffId,
            date: { $gte: new Date(tomorrowStr + 'T00:00:00+08:00'), $lte: new Date(tomorrowStr + 'T23:59:59+08:00') },
            checkInItems: { $all: fu.checkInItems },
            status: 'planned',
          });
          if (!exists) {
            await FollowUp.create({
              patientId: fu.patientId,
              staffId:   fu.staffId,
              assignedTo:fu.assignedTo,
              date: tomorrowDate,
              type: fu.type,
              status: 'planned',
              theme: fu.theme,
              checkInItems: fu.checkInItems,
              repeatDaily: true,
            });
          }
        }
      }
    } catch { /* 不阻断主流程 */ }

    // 异步重算健康评分（不阻断响应）
    recalcHealthScore(req.user._id).catch(() => {});

    // 异步打卡积分（不阻断响应，历史补录不计分）
    awardCheckinPoints(req.user._id, type, record.recordedAt).catch(() => {});

    res.status(201).json({ success: true, data: record, message: '记录成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: '保存记录失败', error: err.message });
  }
});

// 编辑记录（仅本人录入的记录，修正录入有误的数值/备注/时间）
router.put('/:id', auth, async (req, res) => {
  try {
    const { value, unit, extra, note, recordedAt } = req.body;

    const record = await HealthRecord.findOne({ _id: req.params.id, user: req.user._id });
    if (!record) return res.status(404).json({ success: false, message: '记录不存在' });

    if (value === undefined || value === null || value === '') {
      return res.status(400).json({ success: false, message: '数值不能为空' });
    }

    record.value = String(value);
    if (unit !== undefined) record.unit = unit;
    if (extra !== undefined) record.extra = extra;
    if (note !== undefined) record.note = note;
    if (recordedAt) record.recordedAt = new Date(recordedAt);
    record.status = calcStatus(record.type, value, extra !== undefined ? extra : record.extra);
    record.aiAlertStatus = (record.type === 'bloodPressure' && record.status === 'danger') ? 'pending' : null;

    await record.save();

    recalcHealthScore(req.user._id).catch(() => {});

    res.json({ success: true, data: record, message: '修改成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: '修改失败', error: err.message });
  }
});

// 删除记录
router.delete('/:id', auth, async (req, res) => {
  try {
    const record = await HealthRecord.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!record) return res.status(404).json({ success: false, message: '记录不存在' });
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: '删除失败', error: err.message });
  }
});

module.exports = router;
