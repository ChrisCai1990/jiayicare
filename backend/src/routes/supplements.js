const express = require('express');
const auth = require('../middleware/auth');
const Supplement = require('../models/Supplement');
const router = express.Router();

// 获取营养素列表（含停用）
router.get('/', auth, async (req, res) => {
  const { status } = req.query; // 'active' | 'stopped' | all
  const filter = { user: req.user._id };
  if (status === 'active')   filter.stopped = false;
  if (status === 'stopped')  filter.stopped = true;
  const items = await Supplement.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: items });
});

// 新增营养素
router.post('/', auth, async (req, res) => {
  const { name, brand, dosage, method, frequency, startDate, note } = req.body;
  if (!name || !dosage || !frequency) {
    return res.status(400).json({ success: false, message: '名称、剂量、频次不能为空' });
  }
  const item = await Supplement.create({
    user: req.user._id, name, brand, dosage, method, frequency, startDate, note,
  });
  res.status(201).json({ success: true, data: item, message: '添加成功' });
});

// 编辑营养素
router.put('/:id', auth, async (req, res) => {
  const { name, brand, dosage, method, frequency, startDate, note, stopped, stopDate } = req.body;
  const item = await Supplement.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { name, brand, dosage, method, frequency, startDate, note, stopped, stopDate },
    { new: true }
  );
  if (!item) return res.status(404).json({ success: false, message: '记录不存在' });
  res.json({ success: true, data: item, message: '更新成功' });
});

// 标记停用
router.patch('/:id/stop', auth, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const item = await Supplement.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { stopped: true, stopDate: req.body.stopDate || today },
    { new: true }
  );
  if (!item) return res.status(404).json({ success: false, message: '记录不存在' });
  res.json({ success: true, data: item, message: '已标记停用' });
});

// 删除营养素
router.delete('/:id', auth, async (req, res) => {
  await Supplement.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  res.json({ success: true, message: '删除成功' });
});

module.exports = router;
