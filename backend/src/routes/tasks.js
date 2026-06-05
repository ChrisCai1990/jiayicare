const express = require('express');
const auth = require('../middleware/auth');
const Task = require('../models/Task');
const AbnormalReview = require('../models/AbnormalReview');
const router = express.Router();

const VALID_TYPES     = ['record', 'followup', 'questionnaire', 'checkup', 'consultation', 'upload'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_STATUSES   = ['pending', 'completed', 'cancelled'];

// 获取任务列表
router.get('/', auth, async (req, res) => {
  const { status } = req.query;
  const query = { user: req.user._id };
  if (status) query.status = status;
  const tasks = await Task.find(query).sort({ createdAt: -1 })
    .populate('abnormalReviewId', 'title reviewReason reviewHospital reviewDepartment reviewDate abnormalItems notes status');
  res.json({ success: true, data: tasks });
});

// 新增任务
router.post('/', auth, async (req, res) => {
  const { title, description, type, priority, status, dueDate, dueTime, assignee } = req.body;

  // 必填字段校验
  if (!title || !String(title).trim()) {
    return res.status(400).json({ success: false, message: '任务标题不能为空' });
  }
  // 枚举字段校验
  if (type && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: `type 无效，合法值：${VALID_TYPES.join(', ')}` });
  }
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ success: false, message: `priority 无效，合法值：${VALID_PRIORITIES.join(', ')}` });
  }

  const task = await Task.create({
    user: req.user._id,
    title: String(title).trim(),
    description: description ? String(description).trim() : '',
    type:     type     || undefined,
    priority: priority || 'medium',
    status:   'pending',  // 新建任务始终是 pending，不允许前端指定
    dueDate:  dueDate  || undefined,
    dueTime:  dueTime  || undefined,
    assignee: assignee || undefined,
  });
  res.status(201).json({ success: true, data: task });
});

// 更新任务状态（完成/取消）
router.patch('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status 无效，合法值：${VALID_STATUSES.join(', ')}` });
  }

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { status, ...(status === 'completed' && { completedAt: new Date() }) },
    { new: true }
  ).populate('abnormalReviewId', 'title reviewReason reviewHospital reviewDepartment reviewDate abnormalItems notes status');
  if (!task) return res.status(404).json({ success: false, message: '任务不存在' });

  // 同步异常复查状态
  if (task.abnormalReviewId && status === 'completed') {
    await AbnormalReview.findByIdAndUpdate(task.abnormalReviewId._id || task.abnormalReviewId, {
      status: 'completed', resolvedAt: new Date(),
    });
  }

  res.json({ success: true, data: task });
});

// 删除任务
router.delete('/:id', auth, async (req, res) => {
  const deleted = await Task.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!deleted) return res.status(404).json({ success: false, message: '任务不存在' });
  res.json({ success: true, message: '删除成功' });
});

module.exports = router;
