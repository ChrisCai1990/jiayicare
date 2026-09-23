const router = require('express').Router();
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const FollowUp = require('../models/FollowUp');
const Link = require('../models/FollowUpServiceLink');
const Order = require('../models/Order');
const HealthPlan = require('../models/HealthPlan');
const { isServiceRequest, serviceOutcome } = require('../utils/followUpServiceState');
const { reconcileServiceLinks } = require('../utils/followUpServiceLink');

async function loadServiceRequest(req, res, next) {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: '任务ID无效' });
  const task = await FollowUp.findById(id);
  if (!task || !isServiceRequest(task)) return res.status(404).json({ success: false, message: '服务需求不存在' });
  if (req.staff.role !== 'superadmin' && (req.staff.role !== 'healthPlanner' || String(task.assignedTo) !== String(req.staff._id))) return res.status(403).json({ success: false, message: '仅本任务健康规划师可安排服务' });
  if (!require('../utils/healthManagementRollout').enabledForPatient(task.patientId)) return res.status(403).json({ success: false, code: 'HEALTH_MANAGEMENT_NOT_ENABLED', message: '该客户暂未开放新版健康管理闭环' });
  req.serviceRequest = task;
  next();
}

function followUpFilter(task) {
  const common = { patientId: task.patientId, status: { $in: ['planned', 'in_progress', 'missed'] }, aiStatus: { $ne: 'pending' }, taskRole: { $in: ['', null] } };
  if (['professional_assessment', 'report_followup'].includes(task.sourceType)) return { ...common, assessmentActionKey: task.formData?.linkedFollowUpActionKey || '__missing__' };
  return task.sourceAnnualPlanId ? { ...common, sourceType: 'scheduled', sourceAnnualPlanId: task.sourceAnnualPlanId,
    sourceScheduleKey: require('../../../shared/annualServiceItem.cjs').followUpKey(task) || '__missing_item__', deliveryMode: { $in: ['single', 'managed'] } } : { ...common, sourceScheduleKey: '__missing_annual_source__' };
}

router.post('/:id/annual-booking', staffAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '任务ID无效' });
    const task = await FollowUp.findById(req.params.id);
    if (!task || !require('../../../shared/annualServiceItem.cjs').isAssistance(task)) return res.status(404).json({ success: false, message: '就医协助预约事项不存在' });
    if (!require('../utils/healthManagementRollout').enabledForPatient(task.patientId)) return res.status(403).json({ success: false, message: '该客户尚未开放预约登记' });
    if (req.staff.role !== 'superadmin' && (req.staff.role !== 'healthManager' || String(task.assignedTo) !== String(req.staff._id))) return res.status(403).json({ success: false, message: '仅本任务健管专员可确认预约' });
    if (!require('../../../shared/annualServiceItem.cjs').needsBooking(task)) return res.status(409).json({ success: false, message: '预约已完成或事项已流转，请刷新核对' });
    const receipt = require('../utils/annualBookingReceipt').receipt(req.body, req.staff._id);
    const saved = await FollowUp.updateOne({ _id: task._id, updatedAt: task.updatedAt, status: { $in: ['planned', 'in_progress', 'missed'] }, 'annualBooking.status': { $ne: 'booked' }, 'serviceTracking.linkId': null }, { $set: { annualBooking: receipt } });
    if (!saved.modifiedCount) return res.status(409).json({ success: false, message: '任务已变化，请刷新核对' });
    res.json({ success: true, data: await FollowUp.findById(task._id).populate('assignedTo', 'name role') });
  } catch (error) { res.status(error.statusCode || 500).json({ success: false, message: error.message }); }
});

router.get('/:id/service-link-options', staffAuth, loadServiceRequest, async (req, res) => {
  const task = req.serviceRequest;
  await reconcileServiceLinks({ requestTaskId: task._id });
  const [orders, plans, followUps, link] = await Promise.all([
    Order.find({ user: task.patientId, orderType: 'service', ...require('../utils/orderWorkItem').activeOrderWorkItemQuery() }).select('serviceName orderNo status totalUnits usedUnits createdAt').sort({ createdAt: -1 }).limit(100).lean(),
    HealthPlan.find({ patientId: task.patientId, type: { $in: ['medical_assist', 'annual_checkup', 'nutrition', 'rehab', 'tcm', 'psychology'] }, status: 'active' }).select('title type status createdAt').sort({ createdAt: -1 }).limit(100).lean(),
    FollowUp.find(followUpFilter(task)).select('theme date assignedTo serviceTracking annualBooking').populate('assignedTo', 'name').lean(),
    Link.findOne({ requestTaskId: task._id }).lean(),
  ]);
  res.json({ success: true, data: { orders, plans, followUps, link } });
});

router.post('/:id/service-link', staffAuth, loadServiceRequest, async (req, res) => {
  const task = req.serviceRequest;
  const { targetType, targetId, followUpId, revision } = req.body;
  if (!['order', 'health_plan'].includes(targetType) || !mongoose.isValidObjectId(targetId) || !mongoose.isValidObjectId(followUpId)) return res.status(400).json({ success: false, message: '请选择对应随访和实际服务' });
  if (['completed', 'cancelled'].includes(task.status)) return res.status(409).json({ success: false, message: '该服务需求已结束' });
  const [parent, target, existing] = await Promise.all([
    FollowUp.findOne({ ...followUpFilter(task), _id: followUpId }),
    targetType === 'order'
      ? Order.findOne({ _id: targetId, user: task.patientId, orderType: 'service', ...require('../utils/orderWorkItem').activeOrderWorkItemQuery() }).lean()
      : HealthPlan.findOne({ _id: targetId, patientId: task.patientId, type: { $in: ['medical_assist', 'annual_checkup', 'nutrition', 'rehab', 'tcm', 'psychology'] }, status: 'active' }).lean(),
    Link.findOne({ requestTaskId: task._id }),
  ]);
  if (!parent?.assignedTo) return res.status(400).json({ success: false, message: '请选择同一来源、已审核且已分配健管专员的未完成随访' });
  if (require('../../../shared/annualServiceItem.cjs').isBookingRequest(task) && !existing && parent.annualBooking?.status !== 'booked') return res.status(409).json({ success: false, message: '请先由健管专员完成本事项预约，规划师再安排服务' });
  if (!target || serviceOutcome(targetType, target).status !== 'waiting') return res.status(409).json({ success: false, message: '服务不可关联，请确认属于本客户且正在有效执行' });
  const title = targetType === 'order' ? target.serviceName : target.title;
  let link;
  try {
    if (existing) {
      if (String(existing.followUpId) !== String(parent._id)) return res.status(409).json({ success: false, message: '已关联事项不可换成其他随访' });
      if (existing.status === 'waiting' && existing.targetType === targetType && String(existing.targetId) === String(targetId)) {
        link = existing; // 网络重试复用同一关联。
      } else {
        if (existing.status !== 'attention' || revision !== existing.__v) return res.status(409).json({ success: false, message: '服务关联已变化，请刷新；进行中的服务不能替换' });
        link = await Link.findOneAndUpdate({ _id: existing._id, __v: revision, status: 'attention' }, {
          $set: { targetType, targetId, title, linkedBy: req.staff._id, status: 'waiting', message: '' }, $inc: { __v: 1 },
          $push: { history: { at: new Date(), by: req.staff._id, event: 'relinked', previousType: existing.targetType, previousId: existing.targetId, previousTitle: existing.title } },
        }, { new: true });
        if (!link) return res.status(409).json({ success: false, message: '关联已更新，请刷新' });
      }
    } else {
      await require('../utils/annualServiceLinkStart').startAnnualServiceLink(task, parent);
      link = await Link.create({ patientId: task.patientId, requestTaskId: task._id, followUpId: parent._id, targetType, targetId, title, linkedBy: req.staff._id,
        history: [{ at: new Date(), by: req.staff._id, event: 'linked', targetType, targetId }] });
    }
  } catch (error) {
    if (error.statusCode === 409) return res.status(409).json({ success: false, message: error.message });
    if (error.code === 11000) return res.status(409).json({ success: false, message: '该需求或随访已关联服务，请刷新查看' });
    throw error;
  }
  await reconcileServiceLinks({ _id: link._id });
  res.json({ success: true, data: await FollowUp.findById(task._id).populate('assignedTo', 'name role') });
});

module.exports = router;
