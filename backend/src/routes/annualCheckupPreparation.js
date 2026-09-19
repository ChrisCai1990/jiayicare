const router = require('express').Router();
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const checkPermission = require('../middleware/checkPermission');
const FollowUp = require('../models/FollowUp');
const AnnualPlan = require('../models/AnnualPlan');
const HealthPlan = require('../models/HealthPlan');
const evidence = require('../utils/annualCheckupEvidence');

async function load(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '任务ID无效' });
    const task = await FollowUp.findById(req.params.id).lean();
    evidence.assertPreparationOwner(task, req.staff);
    const annual = await AnnualPlan.findById(task.sourceAnnualPlanId).lean();
    if (!annual?.confirmedAt || String(annual.patientId) !== String(task.patientId)) return res.status(409).json({ success: false, message: '年度方案来源无效' });
    req.checkupTask = task; req.checkupAnnual = annual; next();
  } catch (error) { next(error); }
}

router.get('/:id/checkup-preparation', staffAuth, checkPermission('followups', 'view'), load, async (req, res) => {
  await evidence.reconcileCheckupPreparation({ _id: req.checkupTask._id });
  const task = await FollowUp.findById(req.checkupTask._id).lean();
  evidence.assertPreparationOwner(task, req.staff); // 读后改派不可继续暴露方案列表。
  const plans = evidence.preparationRole(task) === 'familyDoctor'
    ? await HealthPlan.find({ patientId: task.patientId, type: 'annual_checkup', status: { $in: ['draft', 'active'] }, createdAt: { $gte: req.checkupAnnual.confirmedAt }, $or: [{ preparationTaskId: null }, { preparationTaskId: task._id }] })
      .select('title status content.aiStatus pushedAt createdAt').sort({ createdAt: -1 }).limit(100).lean() : [];
  res.json({ success: true, data: { task, plans } });
});

router.put('/:id/checkup-preparation', staffAuth, checkPermission('followups', 'edit'), load, async (req, res) => {
  await evidence.savePreparationEvidence(req.checkupTask, req.checkupAnnual, req.body || {}, req.staff,
    { FollowUp, HealthPlan, isValidId: mongoose.isValidObjectId });
  res.json({ success: true, data: await FollowUp.findById(req.checkupTask._id).populate('assignedTo', 'name role') });
});

router.post('/:id/checkup-preparation/draft', staffAuth, checkPermission('followups', 'edit'), checkPermission('plans', 'create'),
  checkPermission.checkPlanType(() => 'annual_checkup'), load, async (req, res) => {
    const result = await require('../utils/checkupPreparationDraft').createPreparationDraft(req.checkupTask, req.checkupAnnual, req.body || {}, req.staff, {
      FollowUp, HealthPlan, User: require('../models/User'), PlanTemplate: require('../models/PlanTemplate'), isValidId: mongoose.isValidObjectId,
    });
    require('../utils/checkupSuggestionQueue').wakeCheckupSuggestionQueue();
    res.json({ success: true, data: result.plan, reused: result.reused });
  });

function addonService() {
  return require('../utils/checkupSuggestionRuntime').service();
}

router.get('/:id/checkup-preparation/addons', staffAuth, checkPermission('followups', 'view'),
  checkPermission('plans', 'view'), checkPermission.checkPlanType(() => 'annual_checkup'), load, async (req, res) => {
    res.json({ success: true, data: await addonService().read(req.params.id, req.staff) });
  });
for (const [suffix, action] of [['', 'generate'], ['/review', 'review'], ['/recover', 'recover']]) {
  router.post(`/:id/checkup-preparation/addons${suffix}`, staffAuth, checkPermission('followups', 'edit'),
    checkPermission('plans', 'edit'), checkPermission.checkPlanType(() => 'annual_checkup'), load, async (req, res) => {
      res.json({ success: true, data: await addonService()[action](req.params.id, req.staff, req.body || {}) });
    });
}

router.use((error, req, res, next) => {
  if (!error.statusCode) return next(error);
  res.status(error.statusCode).json({ success: false, message: error.message });
});
module.exports = router;
