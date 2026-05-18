const express = require('express');
const auth = require('../middleware/auth');
const Task = require('../models/Task');
const router = express.Router();

// 获取任务列表
router.get('/', auth, async (req, res) => {
  const { status } = req.query;
  const query = { user: req.user._id };
  if (status) query.status = status;
  const tasks = await Task.find(query).sort({ createdAt: -1 });
  res.json({ success: true, data: tasks });
});

// 新增任务
router.post('/', auth, async (req, res) => {
  const task = await Task.create({ user: req.user._id, ...req.body });
  res.status(201).json({ success: true, data: task });
});

// 更新任务状态（完成/取消）
router.patch('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { status, ...(status === 'completed' && { completedAt: new Date() }) },
    { new: true }
  );
  if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
  res.json({ success: true, data: task });
});

// 删除任务
router.delete('/:id', auth, async (req, res) => {
  await Task.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  res.json({ success: true, message: '删除成功' });
});

module.exports = router;
