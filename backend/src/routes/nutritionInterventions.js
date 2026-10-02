const router = require('express').Router();
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const HealthPlan = require('../models/HealthPlan');
const User = require('../models/User');
const Draft = require('../models/NutritionInterventionDraft');
const workflow = require('../utils/nutritionInterventionTasks');

async function source(req, res, write = false) {
  if (!mongoose.isValidObjectId(req.params.planId)) { res.status(400).json({ success: false, message: '方案ID无效' }); return null; }
  const plan = await HealthPlan.findOne({ _id: req.params.planId, type: 'nutrition' });
  if (!plan) { res.status(404).json({ success: false, message: '营养方案不存在' }); return null; }
  const user = await User.findById(plan.patientId).select('tenantId isDeleted assignedNutritionist assignedFamilyDoctor assignedHealthManager').lean();
  if (!user || user.isDeleted || String(user.tenantId || '') !== String(req.staff.tenantId || '')) {
    res.status(403).json({ success: false, message: '无本客户权限' }); return null;
  }
  const role = req.staff.role;
  const own = String(plan.staffId) === String(req.staff._id) || String(user.assignedNutritionist) === String(req.staff._id);
  const read = own || (role === 'familyDoctor' && String(user.assignedFamilyDoctor) === String(req.staff._id))
    || (role === 'healthManager' && String(user.assignedHealthManager) === String(req.staff._id));
  if (role !== 'superadmin' && (write ? role !== 'nutritionist' || !own : !read)) {
    res.status(403).json({ success: false, message: '无本方案权限' }); return null;
  }
  return plan;
}
const wrap = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { res.status(e.statusCode || 500).json({ success: false, message: e.statusCode ? e.message : '营养任务处理失败，请稍后重试' }); }
};

router.get('/plans/:planId', staffAuth, wrap(async (req, res) => {
  const plan = await source(req, res); if (!plan) return;
  const draft = await Draft.findById(plan._id).lean();
  res.json({ success: true, data: draft });
}));
router.post('/plans/:planId/generate', staffAuth, wrap(async (req, res) => {
  const plan = await source(req, res, true); if (!plan) return;
  await workflow.inputFor(plan);
  setImmediate(() => workflow.generate(plan).catch(e => console.error('营养任务草稿重试失败', { planId: String(plan._id), message: e.message })));
  res.status(202).json({ success: true, queued: true });
}));
router.post('/plans/:planId/publish', staffAuth, wrap(async (req, res) => {
  const plan = await source(req, res, true); if (!plan) return;
  if (!plan.pushedAt || plan.status !== 'active') return res.status(409).json({ success: false, message: '方案尚未推送' });
  const draft = await Draft.findById(plan._id).lean();
  if (!draft) return res.status(404).json({ success: false, message: '请先生成并审核任务草稿' });
  if (draft.status !== 'publishing' && req.body.revision !== draft.revision) return res.status(409).json({ success: false, message: '草稿已变化，请刷新后再确认' });
  if (draft.status === 'publishing' && String(draft.approvedBy) !== String(req.staff._id) && req.staff.role !== 'superadmin') return res.status(403).json({ success: false, message: '请由原确认人重试发布' });
  const published = await workflow.publish(plan, draft, req.staff, req.body.actions);
  res.json({ success: true, data: published });
}));

module.exports = router;
