const express = require('express');
const auth = require('../middleware/auth');
const Medication = require('../models/Medication');
const router = express.Router();

// 获取用药列表（含全生命周期：进行中 + 已停用）
router.get('/', auth, async (req, res) => {
  const { status } = req.query; // 'active' | 'stopped' | all
  const filter = { user: req.user._id, active: true };
  if (status === 'active')  filter.stopped = false;
  if (status === 'stopped') filter.stopped = true;
  const meds = await Medication.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: meds });
});

// 新增用药
router.post('/', auth, async (req, res) => {
  const { name, brandName, dosage, method, frequency, timing, startDate, note } = req.body;
  if (!name || !dosage || !frequency) {
    return res.status(400).json({ success: false, message: '药品名称、剂量、频次不能为空' });
  }
  const med = await Medication.create({
    user: req.user._id, name, brandName, dosage, method, frequency, timing, startDate, note,
  });
  res.status(201).json({ success: true, data: med, message: '添加成功' });
});

// 标记停用
router.patch('/:id/stop', auth, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const med = await Medication.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { stopped: true, stopDate: req.body.stopDate || today, stopReason: req.body.stopReason || '' },
    { new: true }
  );
  if (!med) return res.status(404).json({ success: false, message: '药品不存在' });
  res.json({ success: true, data: med, message: '已标记停用' });
});

// 今日打卡（标记已服药）
router.post('/:id/checkin', auth, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const med = await Medication.findOne({ _id: req.params.id, user: req.user._id });
  if (!med) return res.status(404).json({ success: false, message: '药品不存在' });

  const existing = med.checkIns.find(c => c.date === today);
  if (existing) {
    existing.status = 'taken';
    existing.time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else {
    med.checkIns.push({
      date: today,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      status: 'taken',
    });
  }
  await med.save();
  res.json({ success: true, message: '打卡成功', data: med });
});

// 删除用药
router.delete('/:id', auth, async (req, res) => {
  await Medication.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { active: false }
  );
  res.json({ success: true, message: '删除成功' });
});

module.exports = router;
