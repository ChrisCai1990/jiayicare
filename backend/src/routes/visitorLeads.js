const express = require('express');
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const checkPermission = require('../middleware/checkPermission');
const Lead = require('../models/VisitorLead');
const Intake = require('../models/ServiceIntake');
const User = require('../models/User');
const Order = require('../models/Order');
const Plan = require('../models/HealthPlan');
const FollowUp = require('../models/FollowUp');
const { id, fail, futureDate, responseDueAt, progress } = require('../utils/serviceIntake');
const { normalizeText } = require('../utils/visitorAssistantSafety');

module.exports = ({ getVisiblePlanPatientIds }) => {
  const router = express.Router();
  const scope = req => ({ tenantId: req.staff.tenantId || null });
  const ownerScope = req => req.staff.role === 'superadmin' ? {} : { ownerId: req.staff._id };
  const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : '承接处理未完成，请刷新后重试' });
  } };
  router.use((req, res, next) => /^\/(visitor-leads|service-intakes)(\/|$)/.test(req.path) ? next() : next('router'));
  router.use(staffAuth, (req, res, next) => {
    if (!['healthPlanner', 'superadmin'].includes(req.staff.role) || req.staff.staffStatus === 'inactive') return res.status(403).json({ success: false, message: '仅健康规划师或超管可处理官网服务承接' });
    next();
  });
  async function patient(req, patientId) {
    if (!mongoose.isValidObjectId(patientId)) fail('请选择有效客户');
    const visible = await getVisiblePlanPatientIds(req.staff);
    if (visible && !visible.some(v => id(v) === id(patientId))) fail('无权承接该客户', 403);
    const row = await User.findOne({ _id: patientId, ...scope(req), isDeleted: { $ne: true } }).select('_id name phone').lean();
    if (!row) fail('客户不存在或不属于当前机构', 404);
    return row;
  }
  async function lead(req) {
    if (!mongoose.isValidObjectId(req.params.id)) fail('线索标识无效');
    const row = await Lead.findOne({ _id: req.params.id, ...scope(req) }).lean();
    if (!row) fail('线索不存在或已过期', 404);
    if (row.assignedTo && id(row.assignedTo) !== id(req.staff._id) && req.staff.role !== 'superadmin') fail('该线索已由其他规划师承接', 403);
    return row;
  }
  async function load(req) {
    if (!mongoose.isValidObjectId(req.params.id)) fail('承接标识无效');
    const row = await Intake.findOne({ _id: req.params.id, ...scope(req), ...ownerScope(req) }).lean();
    if (!row) fail('承接不存在或无权限', 404);
    await patient(req, row.patientId);
    return row;
  }
  async function details(req, row) {
    const [customer, order, plan, tasks] = await Promise.all([
      patient(req, row.patientId),
      row.orderId ? Order.findOne({ _id: row.orderId, user: row.patientId, ...scope(req) }).select('serviceName status tradeStatus paymentStatus currentStage').lean() : null,
      row.planId ? Plan.findOne({ _id: row.planId, patientId: row.patientId, ...scope(req) }).select('title status').lean() : null,
      row.orderId || row.planId ? FollowUp.find({ patientId: row.patientId, ...scope(req), $or: [
        ...(row.orderId ? [{ sourceOrderId: row.orderId }] : []), ...(row.planId ? [{ sourceHealthPlanId: row.planId }] : []),
      ], status: { $in: ['planned', 'in_progress', 'missed'] } }).select('theme status taskRole isBlocked assignedTo').populate('assignedTo', 'name').lean() : [],
    ]);
    return { ...row, customer, order, plan, progress: progress(row, order, plan, tasks) };
  }
  router.get('/visitor-leads/workbench', checkPermission('leads', 'view'), wrap(async (req, res) => {
    const visible = await getVisiblePlanPatientIds(req.staff);
    const data = await require('../utils/consultationWorkbench').consultationTodos(req.staff, visible, { Lead, Intake });
    res.json({ success: true, data, total: data.length });
  }));
  router.get('/visitor-leads', checkPermission('leads', 'view'), wrap(async (req, res) => {
    const filter = { ...scope(req), ...(req.staff.role === 'superadmin' ? {} : { $or: [{ assignedTo: null }, { assignedTo: req.staff._id }] }),
      ...(['new', 'contacted', 'closed'].includes(req.query.status) ? { status: req.query.status } : {}) };
    if (req.query.itemId) { if (!mongoose.isValidObjectId(req.query.itemId)) fail('事项标识无效'); filter._id = req.query.itemId; }
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1), limit = 50;
    const [rows, total] = await Promise.all([Lead.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('assignedTo', 'name').lean(), Lead.countDocuments(filter)]);
    const intakes = await Intake.find({ _id: { $in: rows.map(r => r._id) }, ...scope(req), ...ownerScope(req) }).select('_id').lean();
    const linked = new Set(intakes.map(id));
    res.json({ success: true, data: rows.map(row => ({ ...row, intakeId: linked.has(id(row)) ? row._id : null,
      responseDueAt: responseDueAt(row.createdAt), overdue: row.status === 'new' && +responseDueAt(row.createdAt) < Date.now() })), total, page, limit });
  }));
  router.get('/visitor-leads/:id/customer-match', checkPermission('leads', 'view'), wrap(async (req, res) => {
    const row = await lead(req);
    const visible = await getVisiblePlanPatientIds(req.staff);
    const rows = row.phone ? await User.find({ ...scope(req), phone: row.phone, isDeleted: { $ne: true },
      ...(visible ? { _id: { $in: visible } } : {}),
    }).select('_id name phone').lean() : [];
    res.json({ success: true, data: rows });
  }));
  router.patch('/visitor-leads/:id', checkPermission('leads', 'edit'), wrap(async (req, res) => {
    const row = await lead(req), status = req.body.status;
    if (row.acceptance) fail('线索已进入服务承接，请在承接记录中继续跟进', 409);
    if (req.body.baseUpdatedAt !== row.updatedAt.toISOString()) fail('线索已变化，请刷新后重试', 409);
    if (!['new', 'contacted', 'closed'].includes(status)) fail('线索状态不正确');
    const note = normalizeText(req.body.contactNote, 500);
    if (!note) fail('请填写本次联系记录或关闭原因');
    const recordedAt = new Date();
    const events = [...(row.contactEvents || [])];
    if (!events.length && row.contactNote) events.push({ status: row.status, note: row.contactNote, at: row.contactedAt || null });
    events.push({ status, note, at: recordedAt, actorId: req.staff._id, actorName: req.staff.name || '' });
    const saved = await Lead.findOneAndUpdate({ _id: row._id, ...scope(req), updatedAt: row.updatedAt, acceptance: null }, { $set: {
      status, assignedTo: req.staff._id, contactNote: note, contactEvents: events,
      ...(status === 'contacted' ? { contactedAt: recordedAt } : {}),
    } }, { new: true }).lean();
    if (!saved) fail('线索刚刚发生变化，请刷新', 409);
    res.json({ success: true, data: saved });
  }));
  router.post('/visitor-leads/:id/convert', checkPermission('leads', 'edit'), wrap(async (req, res) => {
    let row = await lead(req);
    if (row.status !== 'contacted') fail('请先联系客户并记录联系结果');
    if (req.body.customerConfirmed !== true) fail('请先向客户确认身份及本次服务需求');
    const customer = await patient(req, req.body.patientId), need = normalizeText(req.body.need, 1000);
    if (!need || !['medical_assistance', 'metabolic_84', 'long_term'].includes(req.body.serviceDirection)) fail('请填写确认后的服务需求与方向');
    const existing = await Intake.findOne({ _id: row._id, ...scope(req) }).lean();
    if (existing) {
      if (id(existing.patientId) !== id(customer) || (req.staff.role !== 'superadmin' && id(existing.ownerId) !== id(req.staff._id))) fail('线索已经承接到另一客户或负责人，请核对', 409);
      return res.json({ success: true, data: await details(req, existing), reused: true });
    }
    if (row.acceptance && (id(row.acceptance.patientId) !== id(customer) || id(row.acceptance.ownerId) !== id(req.staff._id))) fail('已有待恢复的承接，请原负责人使用原客户重试', 409);
    if (!row.acceptance) {
      const at = new Date();
      const acceptance = { patientId: customer._id, ownerId: req.staff._id, customerConfirmedAt: at, need,
        serviceDirection: req.body.serviceDirection, nextContactAt: futureDate(req.body.nextContactAt) };
      row = await Lead.findOneAndUpdate({ _id: row._id, ...scope(req), updatedAt: row.updatedAt, status: 'contacted', acceptance: null }, { $set: { acceptance } }, { new: true }).lean();
      if (!row) fail('线索正在更新，请刷新后重试', 409);
    }
    const accepted = row.acceptance;
    try {
      const created = await Intake.create({ _id: row._id, ...scope(req), sourceLeadId: row._id, source: row.source,
        sourceConsentAt: row.consentAt, ...accepted, events: [{ at: accepted.customerConfirmedAt, by: accepted.ownerId, action: 'accepted', note: accepted.need }] });
      res.status(201).json({ success: true, data: await details(req, created.toObject()) });
    } catch (error) { if (error.code === 11000) fail('线索已被承接，请刷新查看原记录', 409); throw error; }
  }));
  router.get('/service-intakes', checkPermission('leads', 'view'), wrap(async (req, res) => {
    const visible = await getVisiblePlanPatientIds(req.staff);
    const filter = { ...scope(req), ...ownerScope(req), ...(visible ? { patientId: { $in: visible } } : {}),
      ...(['open', 'closed'].includes(req.query.status) ? { status: req.query.status } : {}) };
    if (req.query.itemId) { if (!mongoose.isValidObjectId(req.query.itemId)) fail('事项标识无效'); filter._id = req.query.itemId; }
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1), limit = 20;
    const [rows, total, overdue] = await Promise.all([Intake.find(filter).sort({ nextContactAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(), Intake.countDocuments(filter), Intake.countDocuments({ ...filter, status: 'open', nextContactAt: { $lt: new Date() } })]);
    res.json({ success: true, data: await Promise.all(rows.map(row => details(req, row))), total, page, limit, overdue });
  }));
  router.get('/service-intakes/:id/options', checkPermission('leads', 'view'), checkPermission('patients', 'view'), wrap(async (req, res) => {
    const row = await load(req);
    const [orders, plans] = await Promise.all([
      Order.find({ user: row.patientId, ...scope(req) }).select('serviceName status tradeStatus createdAt').sort({ createdAt: -1 }).limit(100).lean(),
      Plan.find({ patientId: row.patientId, ...scope(req) }).select('title status sourceOrderId').sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    res.json({ success: true, data: { orders, plans } });
  }));
  router.patch('/service-intakes/:id', checkPermission('leads', 'edit'), wrap(async (req, res) => {
    const row = await load(req), body = req.body;
    if (row.status !== 'open' || body.revision !== row.revision) fail('承接已变化或已关闭，请刷新', 409);
    const note = normalizeText(body.note, 1000); if (!note) fail('请填写本次跟进记录');
    const set = {}, action = body.action;
    if (action === 'link') {
      if (row.orderId || row.planId) fail('已有服务关联，不能覆盖。请在原服务继续办理', 409);
      if (!body.orderId && !body.planId) fail('请选择本次订单或服务方案');
      for (const value of [body.orderId, body.planId].filter(Boolean)) if (!mongoose.isValidObjectId(value)) fail('关联标识无效');
      const order = body.orderId ? await Order.findOne({ _id: body.orderId, user: row.patientId, ...scope(req) }).lean() : null;
      const plan = body.planId ? await Plan.findOne({ _id: body.planId, patientId: row.patientId, ...scope(req) }).lean() : null;
      if ((body.orderId && !order) || (body.planId && !plan)) fail('只能关联同客户、同机构的服务', 403);
      if (plan?.sourceOrderId && id(plan.sourceOrderId) !== id(order)) fail('所选方案与订单不一致，请同时选择方案所属订单');
      set.orderId = order?._id || null; set.planId = plan?._id || null;
      set.nextContactAt = futureDate(body.nextContactAt);
    } else if (action === 'followup') set.nextContactAt = futureDate(body.nextContactAt);
    else if (action === 'close') {
      const current = await details(req, row);
      if (!current.progress.canClose) fail('原服务仍有待办或尚未结束，不能关闭承接', 409);
      set.status = 'closed'; set.closureReason = note;
    } else fail('处理动作无效');
    const saved = await Intake.findOneAndUpdate({ _id: row._id, ...scope(req), revision: row.revision, status: 'open' }, {
      $set: set, $inc: { revision: 1 }, $push: { events: { at: new Date(), by: req.staff._id, action, note, orderId: set.orderId, planId: set.planId } },
    }, { new: true }).lean();
    if (!saved) fail('承接刚刚更新，请刷新后重试', 409);
    res.json({ success: true, data: await details(req, saved) });
  }));
  return router;
};
