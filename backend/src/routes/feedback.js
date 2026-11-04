const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const Feedback = require('../models/Feedback');
const staffAuth = require('../middleware/staffAuth');
const workflow = require('../utils/feedbackWorkflow');
const handle = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};

// POST /api/feedback — 用户提交帮助反馈
router.post('/', auth, async (req, res) => {
  const { type = '意见建议', content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: '请填写反馈内容' });
  }

  await Feedback.create({
    user: req.user._id,
    tenantId: req.user.tenantId || null,
    type,
    content: content.trim(),
  });

  res.json({
    success: true,
    message: type === '账号注销申请'
      ? '注销申请已提交。我们会先核验身份，并在 3 个工作日内通过此处反馈处理进度。'
      : '感谢您的反馈！我们会在 3 个工作日内处理。',
  });
});

// GET /api/feedback/mine — 用户端查看自己提交过的反馈及回复
router.get('/mine', auth, async (req, res) => {
  const list = await Feedback.find({ user: req.user._id })
    .select('type content status reply repliedAt createdAt updatedAt')
    .sort({ createdAt: -1 })
    .limit(50);
  res.json({ success: true, data: list });
});

// GET /api/feedback — 超管后台反馈列表（?status=pending|resolved）
router.get('/assignees', adminAuth, handle(async (req, res) => {
  res.json({ success: true, data: await workflow.candidates(req.admin) });
}));

// Only the current assignee may view or handle a feedback item. Patient access is not expanded.
router.get('/assigned', staffAuth, handle(async (req, res) => {
  const filter = { ...workflow.scope(req.staff), assignedTo: req.staff._id };
  if (req.query.item) {
    if (!/^[a-f\d]{24}$/i.test(req.query.item)) return res.status(400).json({ success: false, message: '反馈编号无效' });
    filter._id = req.query.item;
  } else if (req.query.history !== '1') { filter.status = 'pending'; filter.workflowState = 'assigned'; }
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const list = await Feedback.find(filter).select(workflow.staffFields).sort({ assignedAt: -1, _id: -1 }).skip((page - 1) * 50).limit(50).lean();
  res.json({ success: true, data: list, total: await Feedback.countDocuments(filter), page });
}));
router.post('/:id/result', staffAuth, handle(async (req, res) => {
  await workflow.submit(req.staff, req.params.id, req.body);
  res.json({ success: true });
}));
router.post('/:id/assign', adminAuth, handle(async (req, res) => {
  res.json({ success: true, data: await workflow.assign(req.admin, req.params.id, req.body) });
}));

router.get('/', adminAuth, handle(async (req, res) => {
  workflow.manager(req.admin);
  const filter = { ...workflow.scope(req.admin) };
  if (['pending', 'resolved'].includes(req.query.status)) filter.status = req.query.status;
  const stage = req.query.stage;
  if (stage === 'unassigned') { filter.status = 'pending'; filter.$or = [{ workflowState: 'unassigned' }, { workflowState: { $exists: false } }]; }
  if (['assigned', 'submitted'].includes(stage)) { filter.status = 'pending'; filter.workflowState = stage; }
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const list = await Feedback.find(filter)
    .populate('user', 'name phone')
    .sort({ createdAt: -1 })
    .skip((page - 1) * 50).limit(50);
  const total = await Feedback.countDocuments(filter);
  res.json({ success: true, data: list, total, page });
}));

// PATCH /api/feedback/:id — 标记已处理 / 回复
router.patch('/:id', adminAuth, handle(async (req, res) => {
  res.json({ success: true, data: await workflow.close(req.admin, req.params.id, req.body) });
}));

module.exports = router;
