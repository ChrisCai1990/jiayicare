const router = require('express').Router();
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const Request = require('../models/NutritionAssessmentRequest');
const User = require('../models/User');
const Admin = require('../models/Admin');
const HealthPlan = require('../models/HealthPlan');
const Config = require('../models/NutritionAssessmentConfig');

const active = ['awaiting_booking', 'booked'];
const clean = (value, limit = 2000) => String(value || '').trim().slice(0, limit);
const same = (a, b) => String(a || '') === String(b || '');
const bad = (res, status, message) => res.status(status).json({ success: false, message });
const isId = value => mongoose.isValidObjectId(value);
const event = (staff, action, note = '') => ({ action, note, actorId: staff._id, actorName: staff.name || staff.role, at: new Date() });
const visible = (row, staff) => same(row.tenantId, staff.tenantId) && (
  staff.role === 'superadmin' || same(row.advisorId, staff._id)
  || same(row.managerId, staff._id) || same(row.nutritionistId, staff._id));
const load = async (req, res) => {
  if (!isId(req.params.id)) { bad(res, 400, '需求单ID无效'); return null; }
  const row = await Request.findOne({ _id: req.params.id, tenantId: req.staff.tenantId });
  if (!row) { bad(res, 404, '营养评估需求单不存在'); return null; }
  if (!visible(row, req.staff)) { bad(res, 403, '无权查看该需求单'); return null; }
  return row;
};
const populate = query => query.populate('patientId', 'name phone')
  .populate('advisorId', 'name role').populate('managerId', 'name role')
  .populate('nutritionistId', 'name role').populate('sourcePlanId', 'title type status');
const wrap = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    if (error.code === 11000) return bad(res, 409, '该会员已有进行中的同类营养评估，请先处理原需求单');
    console.error('[nutrition-assessment]', error);
    bad(res, 500, '营养评估处理失败，请稍后重试');
  }
};

router.get('/config', staffAuth, wrap(async (req, res) => {
  const row = await Config.findOne({ tenantId: req.staff.tenantId }).lean();
  res.json({ success: true, data: row || { enabled: false, requestTitle: '营养评估需求单', requestInstructions: '请说明评估原因及重点关注问题', bookingInstructions: '与客户确认日期、具体时间及线上腾讯会议室或线下门店', assessmentInstructions: '形成评估结论及后续建议', onlineEnabled: true, offlineEnabled: true } });
}));

router.get('/', staffAuth, wrap(async (req, res) => {
  const staff = req.staff;
  if (!['familyDoctor', 'healthManager', 'nutritionist', 'superadmin'].includes(staff.role))
    return bad(res, 403, '当前岗位无营养评估权限');
  const filter = { tenantId: staff.tenantId };
  if (staff.role !== 'superadmin') filter[{
    familyDoctor: 'advisorId', healthManager: 'managerId', nutritionist: 'nutritionistId',
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

router.post('/', staffAuth, wrap(async (req, res) => {
  const staff = req.staff;
  if (!['familyDoctor', 'superadmin'].includes(staff.role)) return bad(res, 403, '仅健康顾问可发起营养评估');
  const { patientId, source, sourcePlanId } = req.body || {};
  if (!isId(patientId) || !['followup', 'nutrition_plan'].includes(source)) return bad(res, 400, '请选择会员和发起入口');
  const config = await Config.findOne({ tenantId: staff.tenantId }).lean();
  if (config?.enabled !== true) return bad(res, 409, '请先在管理端启用营养评估需求单');
  const reason = clean(req.body.reason), focus = clean(req.body.focus);
  if (reason.length < 5) return bad(res, 400, '请填写至少5字的评估原因');
  const patient = await User.findOne({ _id: patientId, tenantId: staff.tenantId, isDeleted: { $ne: true } })
    .select('assignedFamilyDoctor assignedHealthManager assignedNutritionist').lean();
  if (!patient) return bad(res, 404, '会员不存在');
  if (staff.role !== 'superadmin' && !same(patient.assignedFamilyDoctor, staff._id)) return bad(res, 403, '仅该会员所属健康顾问可发起');
  if (!patient.assignedHealthManager || !patient.assignedNutritionist) return bad(res, 409, '请先分配健管专员和营养师');
  const assignees = await Admin.find({ _id: { $in: [patient.assignedHealthManager, patient.assignedNutritionist] },
    tenantId: staff.tenantId, staffStatus: { $ne: 'inactive' } }).select('_id role').lean();
  if (!assignees.some(a => same(a._id, patient.assignedHealthManager) && a.role === 'healthManager')
    || !assignees.some(a => same(a._id, patient.assignedNutritionist) && a.role === 'nutritionist'))
    return bad(res, 409, '责任健管专员或营养师不可用，请核对人员归属');
  let plan = null;
  if (source === 'nutrition_plan') {
    if (!isId(sourcePlanId)) return bad(res, 400, '请选择营养干预方案');
    plan = await HealthPlan.findOne({ _id: sourcePlanId, patientId, tenantId: staff.tenantId, type: 'nutrition' }).lean();
    if (!plan) return bad(res, 404, '营养干预方案不存在');
    if (plan.status !== 'active') return bad(res, 409, '请从进行中的营养干预方案发起复评');
  } else if (sourcePlanId) return bad(res, 400, '随访发起不可关联营养方案');
  if (await Request.exists({ tenantId: staff.tenantId, patientId, source, sourcePlanId: plan?._id || null, status: { $in: active } }))
    return bad(res, 409, '该会员已有进行中的同类营养评估，请先处理原需求单');
  const row = await Request.create({
    tenantId: staff.tenantId, patientId, source, sourcePlanId: plan?._id || null,
    assessmentType: source === 'followup' ? 'initial' : 'reassessment', reason, focus,
    advisorId: patient.assignedFamilyDoctor || staff._id, managerId: patient.assignedHealthManager,
    nutritionistId: patient.assignedNutritionist, events: [event(staff, 'requested', reason)],
  });
  res.status(201).json({ success: true, data: await populate(Request.findById(row._id)) });
}));

router.post('/:id/booking', staffAuth, wrap(async (req, res) => {
  const row = await load(req, res); if (!row) return;
  if (req.staff.role !== 'superadmin' && (req.staff.role !== 'healthManager' || !same(row.managerId, req.staff._id)))
    return bad(res, 403, '仅责任健管专员可确认预约');
  if (!active.includes(row.status)) return bad(res, 409, '当前状态不可预约');
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
  res.json({ success: true, data: await populate(Request.findById(updated._id)) });
}));

router.post('/:id/complete', staffAuth, wrap(async (req, res) => {
  const row = await load(req, res); if (!row) return;
  if (req.staff.role !== 'superadmin' && (req.staff.role !== 'nutritionist' || !same(row.nutritionistId, req.staff._id)))
    return bad(res, 403, '仅责任营养师可提交评估');
  if (row.status !== 'booked') return bad(res, 409, '请先由健管专员完成预约');
  const summary = clean(req.body?.summary, 10000), recommendations = clean(req.body?.recommendations, 10000);
  if (summary.length < 10 || recommendations.length < 5) return bad(res, 400, '请填写评估结论和后续建议');
  const updated = await Request.findOneAndUpdate({ _id: row._id, status: 'booked' },
    { $set: { status: 'completed', assessment: { summary, recommendations, completedAt: new Date() } },
      $push: { events: event(req.staff, 'completed', summary.slice(0, 200)) } }, { new: true });
  if (!updated) return bad(res, 409, '需求单已被其他人更新，请刷新');
  res.json({ success: true, data: await populate(Request.findById(updated._id)) });
}));

router.post('/:id/cancel', staffAuth, wrap(async (req, res) => {
  const row = await load(req, res); if (!row) return;
  if (req.staff.role !== 'superadmin' && !same(row.advisorId, req.staff._id))
    return bad(res, 403, '仅发起顾问可取消需求');
  if (!active.includes(row.status)) return bad(res, 409, '该需求单已结束');
  const reason = clean(req.body?.reason, 1000);
  if (reason.length < 5) return bad(res, 400, '请填写取消原因');
  const updated = await Request.findOneAndUpdate({ _id: row._id, status: row.status },
    { $set: { status: 'cancelled' }, $push: { events: event(req.staff, 'cancelled', reason) } }, { new: true });
  if (!updated) return bad(res, 409, '需求单已被其他人更新，请刷新');
  res.json({ success: true, data: await populate(Request.findById(updated._id)) });
}));

module.exports = router;
