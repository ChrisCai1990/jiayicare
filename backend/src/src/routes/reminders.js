const express = require('express');
const auth = require('../middleware/auth');
const Reminder = require('../models/Reminder');
const router = express.Router();

// 判断某提醒今天是否激活
function isActiveToday(r) {
  if (!r.enabled) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (r.scheduleType === 'once') {
    if (!r.targetDate) return false;
    const td = new Date(r.targetDate);
    td.setHours(0, 0, 0, 0);
    return td.getTime() === today.getTime();
  }

  // recurring
  const start = r.startDate ? new Date(r.startDate) : null;
  const end   = r.endDate   ? new Date(r.endDate)   : null;
  if (start) { start.setHours(0,0,0,0); if (start > today) return false; }
  if (end)   { end.setHours(0,0,0,0);   if (end < today)   return false; }

  // 每 N 天一次（以 startDate 为基准）
  if (r.customEveryNDays && r.startDate) {
    const base = new Date(r.startDate);
    base.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - base) / 86400000);
    return diff >= 0 && diff % r.customEveryNDays === 0;
  }

  // 每天或指定星期
  if (!r.daysOfWeek || r.daysOfWeek.length === 0) return true;
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return r.daysOfWeek.includes(DAYS[today.getDay()]);
}

// GET / — 列出所有提醒
router.get('/', auth, async (req, res) => {
  const { category } = req.query;
  const query = { user: req.user._id };
  if (category) query.category = category;
  const reminders = await Reminder.find(query).sort({ createdAt: -1 });

  // 附带 isActiveToday 标志
  const data = reminders.map(r => ({
    ...r.toObject(),
    isActiveToday: isActiveToday(r),
  }));
  res.json({ success: true, data });
});

// GET /today — 仅返回今日激活的提醒
router.get('/today', auth, async (req, res) => {
  const all = await Reminder.find({ user: req.user._id, enabled: true });
  const today = all.filter(isActiveToday).map(r => r.toObject());
  res.json({ success: true, data: today });
});

// POST / — 创建提醒
router.post('/', auth, async (req, res) => {
  try {
    const reminder = await Reminder.create({ user: req.user._id, ...req.body });
    res.status(201).json({ success: true, data: reminder });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /:id — 更新提醒
router.patch('/:id', auth, async (req, res) => {
  const reminder = await Reminder.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    req.body,
    { new: true }
  );
  if (!reminder) return res.status(404).json({ success: false, message: '提醒不存在' });
  res.json({ success: true, data: reminder });
});

// PATCH /:id/toggle — 开关
router.patch('/:id/toggle', auth, async (req, res) => {
  const reminder = await Reminder.findOne({ _id: req.params.id, user: req.user._id });
  if (!reminder) return res.status(404).json({ success: false, message: '提醒不存在' });
  reminder.enabled = !reminder.enabled;
  await reminder.save();
  res.json({ success: true, data: reminder });
});

// DELETE /:id
router.delete('/:id', auth, async (req, res) => {
  await Reminder.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  res.json({ success: true, message: '删除成功' });
});

module.exports = router;
module.exports.isActiveToday = isActiveToday;
