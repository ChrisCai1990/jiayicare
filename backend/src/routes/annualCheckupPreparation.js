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

router.get('/:id/checkup-preparation/readiness', staffAuth, checkPermission('followups', 'view'), load, async (req, res) => {
  const data = await require('../utils/checkupPreparationReadiness').loadReadiness(req.params.id, req.staff,
    { FollowUp, AnnualPlan, HealthPlan, User: require('../models/User') }, require('../utils/annualPeriodicGate').annualPeriodicGate);
  res.json({ success: true, data });
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

function handoffService() {
  return require('../utils/checkupPreparationHandoff').createHandoffService({
    customerIntakeError: require('../utils/checkupCustomerIntake').runtimeError,
    FollowUp, AnnualPlan, HealthPlan, Order: require('../models/Order'), Handoff: require('../models/CheckupPreparationHandoff'), isValidId: mongoose.isValidObjectId,
  }, (id, actor) => require('../utils/checkupPreparationReadiness').loadReadiness(id, actor,
    { FollowUp, AnnualPlan, HealthPlan, User: require('../models/User') }, require('../utils/annualPeriodicGate').annualPeriodicGate));
}
router.get('/:id/checkup-preparation/services', staffAuth, checkPermission('followups', 'view'), load, async (req, res) => {
  res.json({ success: true, data: await handoffService().options(req.params.id, req.staff) });
});
router.post('/:id/checkup-preparation/service-link', staffAuth, checkPermission('followups', 'edit'), checkPermission('plans', 'edit'), load, async (req, res) => {
  res.json({ success: true, data: await handoffService().link(req.params.id, req.staff, req.body || {}) });
});
function activationService() {
  return require('../utils/checkupPreparationActivation').createActivationService({ FollowUp, HealthPlan, User: require('../models/User'),
    FollowUpPlan: require('../models/FollowUpPlan'), Handoff: require('../models/CheckupPreparationHandoff') },
  (id, actor) => require('../utils/checkupPreparationReadiness').loadReadiness(id, actor,
    { FollowUp, AnnualPlan, HealthPlan, User: require('../models/User') }, require('../utils/annualPeriodicGate').annualPeriodicGate), handoffService().target);
}
router.post('/:id/checkup-preparation/completion-retry', staffAuth, checkPermission('followups', 'edit'), checkPermission('plans', 'edit'), load, async (req, res) => {
  if (evidence.assertPreparationOwner(req.checkupTask, req.staff) !== 'healthPlanner') return res.status(403).json({ success: false, message: '仅原准备规划师可核验完成回写' });
  const User = require('../models/User');
  const patient = await User.findById(req.checkupTask.patientId).select('assignedHealthPlanner').lean();
  if (req.staff.role !== 'superadmin' && String(patient?.assignedHealthPlanner || '') !== String(req.staff._id)) return res.status(403).json({ success: false, message: '客户归属已变化，请先核对改派' });
  const Handoff = require('../models/CheckupPreparationHandoff');
  const link = await Handoff.findOne({ plannerTaskId: req.checkupTask._id, patientId: req.checkupTask.patientId, annualPlanId: req.checkupTask.sourceAnnualPlanId }).lean();
  if (!link) return res.status(404).json({ success: false, message: '服务承接不存在' });
  await require('../utils/checkupPreparationCompletion').runtime().reconcile(link);
  res.json({ success: true, data: await Handoff.findById(link._id).lean() });
});
for (const [suffix, action] of [['activate', 'activate'], ['activation-recover', 'recover']]) {
  router.post(`/:id/checkup-preparation/${suffix}`, staffAuth, checkPermission('followups', 'edit'), checkPermission('plans', 'edit'), load, async (req, res) => {
    res.json({ success: true, data: await activationService()[action](req.params.id, req.staff, req.body || {}) });
  });
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
