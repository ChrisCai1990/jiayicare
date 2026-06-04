const express = require('express');
const auth = require('../middleware/auth');
const HealthRecord = require('../models/HealthRecord');
const FollowUp = require('../models/FollowUp');
const router = express.Router();

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

    res.status(201).json({ success: true, data: record, message: '记录成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: '保存记录失败', error: err.message });
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

// 状态判断
function calcStatus(type, value, extra) {
  const v = parseFloat(value);
  if (type === 'bloodPressure') {
    const sys = extra?.sys ? parseFloat(extra.sys) : v;
    if (sys >= 140) return 'danger';
    if (sys >= 130) return 'warning';
    return 'normal';
  }
  if (type === 'bloodSugar') {
    if (v >= 7.0) return 'danger';
    if (v >= 6.1) return 'warning';
    if (v < 3.9)  return 'warning';
    return 'normal';
  }
  if (type === 'heartRate') {
    if (v > 100 || v < 60) return 'warning';
    return 'normal';
  }
  if (type === 'sleep') {
    if (v < 6) return 'warning';
    return 'normal';
  }
  return 'normal';
}

module.exports = router;
