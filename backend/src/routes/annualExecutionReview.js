const express = require('express');
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const Plan = require('../models/AnnualPlan');
const User = require('../models/User');
const FollowUp = require('../models/FollowUp');
const Task = require('../models/Task');
const logic = require('../utils/annualExecutionReview');

async function arrangements(plan) {
  const [followUps, tasks] = await Promise.all([
    FollowUp.find({ sourceAnnualPlanId: plan._id, patientId: plan.patientId }).select('_id theme status date updatedAt assignedTo').populate('assignedTo', 'name').sort({ date: 1, _id: 1 }).lean(),
    Task.find({ sourceAnnualPlanId: plan._id, user: plan.patientId }).select('_id title status dueDate updatedAt').sort({ dueDate: 1, _id: 1 }).lean(),
  ]);
  const closed = row => ['completed', 'cancelled'].includes(row.status) ? 1 : 0;
  followUps.sort((a,b) => closed(a) - closed(b)); tasks.sort((a,b) => closed(a) - closed(b));
  return { followUps, tasks, version: logic.taskVersion(followUps, tasks) };
}
module.exports = ({ getVisiblePlanPatientIds }) => {
  const router = express.Router();
  router.use('/:patientId/annual-plan-execution-review/:planId', staffAuth, async (req, res, next) => {
    try {
      const { patientId, planId } = req.params;
      if (![patientId, planId].every(mongoose.isValidObjectId)) return res.status(400).json({ success: false, message: '客户或方案标识无效' });
      const visible = await getVisiblePlanPatientIds(req.staff);
      if (visible && !visible.some(id => String(id) === patientId)) return res.status(403).json({ success: false, message: '无权查看此会员方案' });
      const patient = await User.exists({ _id: patientId, isDeleted: { $ne: true }, ...(req.staff.tenantId ? { tenantId: req.staff.tenantId } : {}) });
      if (!patient) return res.status(403).json({ success: false, message: '无权查看此会员方案' });
      req.executionPlan = await Plan.findOne({ _id: planId, patientId }).select('+supplementRevisions').lean();
      if (!req.executionPlan) return res.status(404).json({ success: false, message: '方案不存在' });
      next();
    } catch (e) { res.status(500).json({ success: false, message: '读取方案失败，请重试' }); }
  });
  router.get('/:patientId/annual-plan-execution-review/:planId', async (req, res) => {
    try {
      const plan = req.executionPlan, revisions = logic.reviews(plan);
      const current = revisions.length ? await arrangements(plan) : { followUps: [], tasks: [], version: '' };
      res.json({ success: true, data: { planId: plan._id, baseUpdatedAt: plan.updatedAt, taskVersion: current.version,
        reviews: revisions.map(r => ({ id: r.id, createdAt: r.createdAt, changes: logic.changesForExecution(r.changes).map(logic.summary), ...r.executionReview })),
        followUps: current.followUps.slice(0, 100), tasks: current.tasks.slice(0, 100),
        totals: { followUps: current.followUps.length, tasks: current.tasks.length },
      } });
    } catch (e) { res.status(500).json({ success: false, message: '读取执行安排失败，请重试' }); }
  });
  router.post('/:patientId/annual-plan-execution-review/:planId', async (req, res) => {
    try {
      if (!['familyDoctor', 'superadmin'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '由健康顾问核对修订后的执行安排' });
      const { outcome, note, baseUpdatedAt, taskVersion } = req.body;
      if (!['unchanged', 'arranged'].includes(outcome) || typeof note !== 'string' || !note.trim() || note.length > 1000) return res.status(400).json({ success: false, message: '请选择核对结论并填写实际处理说明（1000字内）' });
      const plan = req.executionPlan;
      if (!logic.pending(plan).length || new Date(plan.updatedAt).toISOString() !== baseUpdatedAt) return res.status(409).json({ success: false, message: '方案修订状态已变化，请刷新核对' });
      const current = await arrangements(plan);
      if (current.version !== taskVersion) return res.status(409).json({ success: false, message: '执行安排已变化，请刷新后核对' });
      const reviewedAt = new Date();
      const supplementRevisions = plan.supplementRevisions.map(r => r.executionReview?.version === 1 && r.executionReview.status === 'pending' && r.status === 'applied'
        ? { ...r, executionReview: { ...r.executionReview, status: 'reviewed', outcome, note: note.trim(), reviewedAt, reviewedBy: req.staff._id, reviewedByName: req.staff.name || '', taskVersion } } : r);
      const saved = await Plan.updateOne({ _id: plan._id, patientId: plan.patientId, updatedAt: plan.updatedAt, supplementRevisions: plan.supplementRevisions }, { $set: { supplementRevisions } }, { timestamps: false });
      if (!saved.modifiedCount) return res.status(409).json({ success: false, message: '方案已变化，请刷新核对' });
      res.json({ success: true, message: '已记录执行安排核对结果；服务完成状态以原执行记录为准' });
    } catch (e) { res.status(500).json({ success: false, message: '保存核对结果失败，请重试' }); }
  });
  return router;
};
