const router = require('express').Router();
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const Request = require('../models/NutritionAssessmentRequest');
const User = require('../models/User');
const Admin = require('../models/Admin');
const HealthPlan = require('../models/HealthPlan');
const AnnualPlan = require('../models/AnnualPlan');
const Order = require('../models/Order');
const Config = require('../models/NutritionAssessmentConfig');
const { isAvailableNutritionAssessmentOrder, settleNutritionAssessmentOrder } = require('../utils/nutritionAssessmentOrder');

const active = ['awaiting_booking', 'booked'];
const clean = (value, limit = 2000) => String(value || '').trim().slice(0, limit);
const same = (a, b) => String(a || '') === String(b || '');
const bad = (res, status, message) => res.status(status).json({ success: false, message });
const isId = value => mongoose.isValidObjectId(value);
const event = (staff, action, note = '') => ({ action, note, actorId: staff._id, actorName: staff.name || staff.role, at: new Date() });
const visible = (row, staff) => same(row.tenantId, staff.tenantId) && (
  staff.role === 'superadmin' || same(row.advisorId, staff._id)
  || same(row.plannerId, staff._id) || same(row.managerId, staff._id) || same(row.nutritionistId, staff._id));
const load = async (req, res) => {
  if (!isId(req.params.id)) { bad(res, 400, '需求单ID无效'); return null; }
  const row = await Request.findOne({ _id: req.params.id, tenantId: req.staff.tenantId });
  if (!row) { bad(res, 404, '营养评估需求单不存在'); return null; }
  if (!visible(row, req.staff)) { bad(res, 403, '无权查看该需求单'); return null; }
  return row;
};
const populate = query => query.populate('patientId', 'name phone')
  .populate('initiatorId', 'name role')
  .populate('advisorId', 'name role').populate('plannerId', 'name role').populate('managerId', 'name role')
  .populate('nutritionistId', 'name role').populate('sourcePlanId', 'title type status')
  .populate('sourceOrderId', 'orderNo serviceName specificationLabel status paymentStatus usedUnits totalUnits');
const wrap = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    if (error.code === 11000) return bad(res, 409, '该会员已有进行中的同类营养评估，请先处理原需求单');
    if (error.statusCode) return bad(res, error.statusCode, error.message);
    console.error('[nutrition-assessment]', error);
    bad(res, 500, '营养评估处理失败，请稍后重试');
  }
};

router.post('/self-lifestyle-interview', staffAuth, wrap(async (req, res) => {
  if (!await require('../utils/staffRoleCapabilities').isNutritionistStaff(req.staff))
    return bad(res, 403, '仅营养师可发起生活方式访谈');
  const task = await require('../utils/nutritionLifestyleTask').startForNutritionist(req.body?.patientId, req.staff);
  res.status(201).json({ success: true, data: task });
}));

router.post('/:id/execution-task', staffAuth, wrap(async (req, res) => {
  const row = await load(req, res); if (!row) return;
  if (req.staff.role !== 'superadmin' && (!await require('../utils/staffRoleCapabilities').isNutritionistStaff(req.staff)
    || !same(row.nutritionistId, req.staff._id))) return bad(res, 403, '仅责任营养师可打开访谈任务');
  const task = await require('../utils/nutritionLifestyleTask').ensureForRequest(row);
  res.json({ success: true, data: task });
}));

router.get('/config', staffAuth, wrap(async (req, res) => {
  const row = await Config.findOne({ tenantId: req.staff.tenantId }).lean();
  res.json({ success: true, data: row || { enabled: false, requestTitle: '营养评估需求单', requestInstructions: '请说明评估原因及重点关注问题', bookingInstructions: '与客户确认日期、具体时间及线上腾讯会议室或线下门店', assessmentInstructions: '形成评估结论及后续建议', onlineEnabled: true, offlineEnabled: true } });
}));

router.get('/', staffAuth, wrap(async (req, res) => {
  const staff = req.staff;
  if (!['familyDoctor', 'healthPlanner', 'healthManager', 'nutritionist', 'superadmin'].includes(staff.role))
    return bad(res, 403, '当前岗位无营养评估权限');
  const filter = { tenantId: staff.tenantId };
  if (staff.role !== 'superadmin') filter[{
    familyDoctor: 'advisorId', healthPlanner: 'plannerId', healthManager: 'managerId', nutritionist: 'nutritionistId',
  }[staff.role]] = staff._id;
  if (req.query.patientId) {
    if (!isId(req.query.patientId)) return bad(res, 400, '会员ID无效');
    filter.patientId = req.query.patientId;
  }
  if (req.query.status === 'active') filter.status = { $in: active };
  else if (['awaiting_booking', 'booked', 'completed', 'cancelled'].includes(req.query.status)) filter.status = req.query.status;
  const rows = await populate(Request.find(filter).sort({ createdAt: -1 }).limit(100)).lean();
  res.json({ success: true, data: rows });
}));

router.get('/eligible-orders', staffAuth, wrap(async (req, res) => {
  if (!['healthPlanner', 'superadmin'].includes(req.staff.role)) return bad(res, 403, '仅健康规划师可选择评估订单');
  const patientId = req.query.patientId;
  if (!isId(patientId)) return bad(res, 400, '请选择会员');
  const patient = await User.findOne({ _id: patientId, tenantId: req.staff.tenantId, isDeleted: { $ne: true } })
    .select('assignedHealthPlanner').lean();
  if (!patient || req.staff.role !== 'superadmin' && !same(patient.assignedHealthPlanner, req.staff._id))
    return bad(res, 403, '只能查看本人负责会员的评估订单');
  const orders = await Order.find({ user: patientId, tenantId: req.staff.tenantId, orderType: 'service',
    paymentStatus: 'paid', status: { $in: ['pending', 'scheduled'] } }).sort({ createdAt: -1 }).limit(100).lean();
  const candidates = orders.filter(isAvailableNutritionAssessmentOrder);
  const used = await Request.find({ tenantId: req.staff.tenantId, sourceOrderId: { $in: candidates.map(order => order._id) }, status: { $ne: 'cancelled' } })
    .select('sourceOrderId').lean();
  const usedIds = new Set(used.map(row => String(row.sourceOrderId)));
  res.json({ success: true, data: candidates.filter(order => !usedIds.has(String(order._id)))
    .map(order => ({ _id: order._id, orderNo: order.orderNo, serviceName: order.serviceName,
      specificationLabel: order.specificationLabel, createdAt: order.createdAt })) });
}));

router.post('/', staffAuth, wrap(async (req, res) => {
  const staff = req.staff;
  if (!['familyDoctor', 'healthPlanner', 'nutritionist', 'superadmin'].includes(staff.role)) return bad(res, 403, '当前岗位不可发起营养评估');
  const { patientId, source, sourcePlanId, sourceOrderId } = req.body || {};
  if (!isId(patientId) || !['followup', 'nutrition_management', 'nutrition_plan', 'paid_order'].includes(source)) return bad(res, 400, '请选择会员和发起入口');
  if (source === 'paid_order' && staff.role !== 'healthPlanner' && staff.role !== 'superadmin') return bad(res, 403, '已购评估由健康规划师办理');
  if (source !== 'paid_order' && !['familyDoctor', 'nutritionist', 'superadmin'].includes(staff.role)) return bad(res, 403, '年度管理评估由健康顾问或营养师发起');
  if (staff.role === 'nutritionist' && !['followup', 'nutrition_management'].includes(source))
    return bad(res, 403, '营养师仅可从营养管理发起单次评估');
  const config = await Config.findOne({ tenantId: staff.tenantId }).lean();
  if (config?.enabled !== true) return bad(res, 409, '请先在管理端启用营养评估需求单');
  const reason = clean(req.body.reason), focus = clean(req.body.focus);
  if (reason.length < 5) return bad(res, 400, '请填写至少5字的评估原因');
  const preferredAt = source === 'paid_order' ? null : new Date(req.body.preferredAt);
  if (source !== 'paid_order' && (Number.isNaN(preferredAt.getTime()) || preferredAt <= new Date()))
    return bad(res, 400, '请选择未来的期望评估日期和具体时间');
  const patient = await User.findOne({ _id: patientId, tenantId: staff.tenantId, isDeleted: { $ne: true } })
    .select('assignedFamilyDoctor assignedHealthPlanner assignedHealthManager assignedNutritionist servicePackage serviceExpiry').lean();
  if (!patient) return bad(res, 404, '会员不存在');
  const ownerId = source === 'paid_order' ? patient.assignedHealthPlanner
    : staff.role === 'nutritionist' ? patient.assignedNutritionist : patient.assignedFamilyDoctor;
  if (staff.role !== 'superadmin' && !same(ownerId, staff._id))
    return bad(res, 403, source === 'paid_order' ? '仅该会员所属健康规划师可办理' : '仅该会员所属健康顾问或营养师可发起');
  if (!patient.assignedHealthManager || !patient.assignedNutritionist) return bad(res, 409, '请先分配健管专员和营养师');
  const assignees = await Admin.find({ _id: { $in: [patient.assignedHealthManager, patient.assignedNutritionist] },
    tenantId: staff.tenantId, staffStatus: { $ne: 'inactive' } }).select('_id role').lean();
  if (!assignees.some(a => same(a._id, patient.assignedHealthManager) && a.role === 'healthManager')
    || !assignees.some(a => same(a._id, patient.assignedNutritionist) && a.role === 'nutritionist'))
    return bad(res, 409, '责任健管专员或营养师不可用，请核对人员归属');
  let plan = null;
  if (source === 'nutrition_plan') {
    if (sourceOrderId) return bad(res, 400, '方案复评不重复占用单次评估订单');
    if (!isId(sourcePlanId)) return bad(res, 400, '请选择营养干预方案');
    plan = await HealthPlan.findOne({ _id: sourcePlanId, patientId, tenantId: staff.tenantId, type: 'nutrition' }).lean();
    if (!plan) return bad(res, 404, '营养干预方案不存在');
    if (plan.status !== 'active') return bad(res, 409, '请从进行中的营养干预方案发起复评');
  } else if (source === 'paid_order') {
    if (sourcePlanId) return bad(res, 400, '首次评估不可关联营养方案');
    if (!isId(sourceOrderId)) return bad(res, 400, '请选择已购买的单次营养评估订单');
    const order = await Order.findOne({ _id: sourceOrderId, user: patientId, tenantId: staff.tenantId }).lean();
    if (!isAvailableNutritionAssessmentOrder(order)) return bad(res, 409, '评估订单未付款、已使用或不可用');
    if (await Request.exists({ sourceOrderId, status: { $ne: 'cancelled' } })) return bad(res, 409, '该订单已关联营养评估需求');
  } else {
    if (sourcePlanId || sourceOrderId) return bad(res, 400, '单次营养评估不关联订单或营养方案');
    const chinaYear = new Date(Date.now() + 8 * 3600000).getUTCFullYear();
    const annualPlan = await AnnualPlan.exists({ patientId, year: chinaYear, confirmedAt: { $ne: null } });
    if (!annualPlan && !(patient.servicePackage && patient.serviceExpiry && new Date(patient.serviceExpiry) >= new Date()))
      return bad(res, 409, '仅年度管理会员可临时发起营养评估');
  }
  if (await Request.exists({ tenantId: staff.tenantId, patientId,
    source: ['followup', 'nutrition_management'].includes(source) ? { $in: ['followup', 'nutrition_management'] } : source,
    sourcePlanId: plan?._id || null, status: { $in: active } }))
    return bad(res, 409, '该会员已有进行中的同类营养评估，请先处理原需求单');
  const row = await Request.create({
    tenantId: staff.tenantId, patientId, source, sourcePlanId: plan?._id || null,
    sourceOrderId: source === 'paid_order' ? sourceOrderId : null,
    assessmentType: source === 'nutrition_plan' ? 'reassessment' : 'initial', reason, focus, preferredAt,
    initiatorId: staff._id, initiatorRole: staff.role,
    advisorId: source === 'paid_order' ? null : patient.assignedFamilyDoctor || null,
    plannerId: source === 'paid_order' ? patient.assignedHealthPlanner || staff._id : null,
    managerId: patient.assignedHealthManager,
    nutritionistId: patient.assignedNutritionist, events: [event(staff, 'requested', reason)],
  });
  res.status(201).json({ success: true, data: await populate(Request.findById(row._id)) });
}));

router.post('/:id/booking', staffAuth, wrap(async (req, res) => {
  const row = await load(req, res); if (!row) return;
  if (req.staff.role !== 'superadmin' && (req.staff.role !== 'healthManager' || !same(row.managerId, req.staff._id)))
    return bad(res, 403, '仅责任健管专员可确认预约');
  if (!active.includes(row.status)) return bad(res, 409, '当前状态不可预约');
  if (row.sourceOrderId) {
    const order = await Order.findById(row.sourceOrderId).lean();
    if (!isAvailableNutritionAssessmentOrder(order)) return bad(res, 409, '关联订单已退款、取消或核销，请先核对订单');
  }
  const body = req.body || {};
  const at = new Date(body.at);
  const mode = body.mode;
  if (Number.isNaN(at.getTime()) || at <= new Date()) return bad(res, 400, '请选择未来的预约日期和具体时间');
  if (!['online', 'offline'].includes(mode)) return bad(res, 400, '请选择线上或线下');
  const config = await Config.findOne({ tenantId: req.staff.tenantId }).lean();
  if (mode === 'online' && config?.onlineEnabled === false || mode === 'offline' && config?.offlineEnabled === false)
    return bad(res, 409, '本机构未启用所选预约方式');
  const meetingRoom = clean(body.meetingRoom, 500), store = clean(body.store, 500);
  if (mode === 'online' && !meetingRoom) return bad(res, 400, '请填写腾讯会议室信息');
  if (mode === 'offline' && !store) return bad(res, 400, '请填写线下门店');
  const appointment = { at, mode, meetingRoom: mode === 'online' ? meetingRoom : '',
    store: mode === 'offline' ? store : '', note: clean(body.note, 1000) };
  const place = mode === 'online' ? `腾讯会议：${meetingRoom}` : `线下门店：${store}`;
  const previous = row.status === 'booked' && row.appointment?.at
    ? `原预约 ${new Date(row.appointment.at).toISOString()} · ${row.appointment.mode === 'online' ? row.appointment.meetingRoom : row.appointment.store} → ` : '';
  const updated = await Request.findOneAndUpdate({ _id: row._id, status: row.status, __v: row.__v },
    { $set: { status: 'booked', appointment }, $inc: { __v: 1 }, $push: { events: event(req.staff, row.status === 'booked' ? 'rescheduled' : 'booked', `${previous}${at.toISOString()} · ${place}`) } },
    { new: true });
  if (!updated) return bad(res, 409, '需求单已被其他人更新，请刷新');
  if (updated.executionFollowUpId) await require('../models/FollowUp').updateOne({ _id: updated.executionFollowUpId,
    status: { $in: ['planned', 'in_progress', 'missed'] } }, { $set: { date: at } });
  res.json({ success: true, data: await populate(Request.findById(updated._id)) });
}));

router.post('/:id/complete', staffAuth, wrap(async (req, res) => {
  const row = await load(req, res); if (!row) return;
  if (req.staff.role !== 'superadmin' && (req.staff.role !== 'nutritionist' || !same(row.nutritionistId, req.staff._id)))
    return bad(res, 403, '仅责任营养师可提交评估');
  if (row.status === 'completed' && row.sourceOrderId) {
    try { await settleNutritionAssessmentOrder(row, req.staff, Order);
      await Request.updateOne({ _id: row._id }, { $set: { orderSettlementStatus: 'completed' } }); }
    catch (error) { await Request.updateOne({ _id: row._id }, { $set: { orderSettlementStatus: 'needs_review' } });
      return bad(res, 503, `评估已保存，订单核销待核对：${error.message}`); }
    return res.json({ success: true, data: await populate(Request.findById(row._id)) });
  }
  return bad(res, 409, '请打开生活方式访谈完成营养评估');
}));

router.post('/:id/cancel', staffAuth, wrap(async (req, res) => {
  const row = await load(req, res); if (!row) return;
  const initiatorId = row.initiatorId || row.events?.find(item => item.action === 'requested')?.actorId
    || (row.source === 'paid_order' ? row.plannerId : row.advisorId);
  if (req.staff.role !== 'superadmin' && !same(initiatorId, req.staff._id))
    return bad(res, 403, '仅发起人可取消需求');
  if (!active.includes(row.status)) return bad(res, 409, '该需求单已结束');
  const reason = clean(req.body?.reason, 1000);
  if (reason.length < 5) return bad(res, 400, '请填写取消原因');
  if (row.executionFollowUpId) {
    const task = await require('../models/FollowUp').findById(row.executionFollowUpId).lean();
    if (task?.status === 'completed' || ['applying', 'submitted'].includes(task?.formData?.lifestyleInterview?.phase))
      return bad(res, 409, '营养师已开始提交访谈，请先核对任务状态');
  }
  const updated = await Request.findOneAndUpdate({ _id: row._id, status: row.status },
    { $set: { status: 'cancelled' }, $push: { events: event(req.staff, 'cancelled', reason) } }, { new: true });
  if (!updated) return bad(res, 409, '需求单已被其他人更新，请刷新');
  if (updated.executionFollowUpId) await require('../models/FollowUp').updateOne({ _id: updated.executionFollowUpId,
    status: { $in: ['planned', 'in_progress', 'missed'] } }, { $set: { status: 'cancelled', cancelReason: reason } });
  res.json({ success: true, data: await populate(Request.findById(updated._id)) });
}));

module.exports = router;
