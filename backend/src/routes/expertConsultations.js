const router = require('express').Router();
const mongoose = require('mongoose');
const userAuth = require('../middleware/auth');
const staffAuth = require('../middleware/staffAuth');
const Case = require('../models/ExpertConsultationCase');
const Order = require('../models/Order');
const Fulfillment = require('../models/Fulfillment');
const Admin = require('../models/Admin');
const User = require('../models/User');
const MedicalExpert = require('../models/MedicalExpert');
const StaffAvailability = require('../models/StaffAvailability');
const MedicalReport = require('../models/MedicalReport');

const id = value => String(value?._id || value || '');
const text = (value, max = 4000) => String(value || '').trim().slice(0, max);
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const valid = value => mongoose.isValidObjectId(value);
const paid = order => order?.paymentStatus === 'paid' && ['paid', 'fulfilling', 'completed', 'partially_refunded'].includes(order.tradeStatus);
const serviceType = order => ({ expert_consultation: 'single', mdt_consultation: 'mdt' })[order?.serviceWorkflowSnapshot?.key];
const activeOrder = order => paid(order) && order?.status !== 'cancelled' && !['requested', 'processing', 'refunded'].includes(order?.refundStatus);
const event = (row, action, actorId, note = '') => row.history.push({ action, actorId, at: new Date(), note: text(note, 500) });
const staffCanRead = (row, staff) => staff.role === 'superadmin' || [row.managerId, row.advisorId, row.plannerId, ...row.members.map(x => x.staffId)].some(x => id(x) === id(staff._id));
const assigned = (row, staff, field) => staff.role === 'superadmin' || id(row[field]) === id(staff._id);

router.post('/mine', userAuth, async (req, res) => {
  if (!valid(req.body?.orderId)) return fail(res, 400, '订单编号无效');
  const order = await Order.findById(req.body.orderId);
  if (!order || id(order.user) !== id(req.user._id)) return fail(res, 404, '未找到本人服务订单');
  const type = serviceType(order);
  if (!type || !activeOrder(order)) return fail(res, 409, '请先完成对应咨询服务的订单支付');
  if (Number(order.totalUnits || 1) !== 1) return fail(res, 409, '咨询订单须为单次服务，请联系健康规划师核对商品规格');
  const user = await User.findById(order.user).select('assignedHealthManager assignedFamilyDoctor assignedHealthPlanner');
  const request = text(req.body?.request, 1500);
  if (!request) return fail(res, 400, '请简述本次希望咨询的问题');
  const desiredExpertId = valid(req.body?.desiredExpertId) ? req.body.desiredExpertId : null;
  if (desiredExpertId) {
    const desired = await MedicalExpert.findOne({ _id: desiredExpertId, status: 'active', teamEligible: true,
      serviceModes: type === 'mdt' ? 'mdt' : 'single_consultation',
      [type === 'mdt' ? 'mdtFee' : 'singleConsultationFee']: { $lte: 200 } }).select('linkedStaffId').lean();
    if (!desired?.linkedStaffId || !await Admin.exists({ _id: desired.linkedStaffId, tenantId: req.user.tenantId, staffStatus: 'active' }))
      return fail(res, 400, '指定专家不在可选专家库');
  }
  const existing = await Case.findOne({ orderId: order._id });
  if (existing) return res.json({ success: true, data: { id: existing._id, status: existing.status } });
  let row;
  try {
    row = await Case.create({ tenantId: req.user.tenantId, orderId: order._id, patientId: order.user, type,
      specificationLabel: order.specificationLabel || '',
      managerId: user?.assignedHealthManager, advisorId: user?.assignedFamilyDoctor, plannerId: user?.assignedHealthPlanner,
      status: user?.assignedHealthManager && user.assignedFamilyDoctor && user.assignedHealthPlanner ? 'intake' : 'team_assignment',
      clientRequest: request, desiredExpertId, history: [{ action: 'requested', actorId: req.user._id, at: new Date(), note: '' }] });
  } catch (error) {
    if (error.code !== 11000) throw error;
    row = await Case.findOne({ orderId: order._id });
  }
  res.status(201).json({ success: true, data: { id: row._id, status: row.status } });
});

router.get('/mine/experts', userAuth, async (req, res) => {
  const type = req.query.type === 'mdt' ? 'mdt' : 'single';
  const rows = await MedicalExpert.find({ status: 'active', teamEligible: true, linkedStaffId: { $ne: null },
    serviceModes: type === 'mdt' ? 'mdt' : 'single_consultation',
    [type === 'mdt' ? 'mdtFee' : 'singleConsultationFee']: { $lte: 200 } })
    .select('_id name title introduction linkedStaffId').sort({ name: 1 }).limit(100).lean();
  const active = await Admin.find({ _id: { $in: rows.map(x => x.linkedStaffId) }, staffStatus: 'active' }).select('_id').lean();
  const activeIds = new Set(active.map(x => id(x)));
  res.json({ success: true, data: rows.filter(x => activeIds.has(id(x.linkedStaffId))).map(({ linkedStaffId, ...expert }) => expert) });
});

router.get('/mine', userAuth, async (req, res) => {
  const rows = await Case.find({ patientId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: rows.map(row => ({ id: row._id, orderId: row.orderId, type: row.type, status: row.status,
    clientRequest: row.clientRequest, meetingUrl: row.meetingUrl, scheduledAt: row.members[0]?.startAt || null,
    managementPath: row.status === 'completed' ? row.reconciliation : '', followupPlan: row.status === 'completed' ? row.followupPlan : '' })) });
});

router.get('/staff', staffAuth, async (req, res) => {
  const filter = req.staff.role === 'superadmin' ? {} : { $or: [{ managerId: req.staff._id }, { advisorId: req.staff._id }, { plannerId: req.staff._id }, { 'members.staffId': req.staff._id }] };
  const rows = await Case.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ success: true, data: rows });
});

router.get('/staff/experts', staffAuth, async (req, res) => {
  if (!['healthPlanner', 'superadmin'].includes(req.staff.role)) return fail(res, 403, '仅健康规划师可选择专家');
  const rows = await MedicalExpert.find({ status: 'active', teamEligible: true, linkedStaffId: { $ne: null } })
    .select('_id name title institutionId departmentId linkedStaffId serviceModes singleConsultationFee mdtFee').lean();
  const active = await Admin.find({ _id: { $in: rows.map(x => x.linkedStaffId) }, staffStatus: 'active' }).select('_id').lean();
  const activeIds = new Set(active.map(x => id(x)));
  res.json({ success: true, data: rows.filter(x => activeIds.has(id(x.linkedStaffId))) });
});

router.get('/staff/:id/materials', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!staffCanRead(row, req.staff)) return fail(res, 403, '无权查看该服务资料');
  const reportFilter = { user: row.patientId };
  if (!assigned(row, req.staff, 'managerId')) reportFilter._id = { $in: row.materialReportIds };
  const reports = await MedicalReport.find(reportFilter).select('_id title checkDate audit_status').sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: reports });
});

router.post('/staff/:id/team', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (req.staff.role !== 'superadmin' && id(row.plannerId) !== id(req.staff._id)) return fail(res, 403, '仅负责人可分配服务团队');
  if (row.status !== 'team_assignment') return fail(res, 409, '当前阶段不能分配团队');
  const roles = [['managerId', 'healthManager'], ['advisorId', 'familyDoctor'], ['plannerId', 'healthPlanner']];
  for (const [field, role] of roles) {
    const candidateId = req.body?.[field] || row[field];
    if (!valid(candidateId) || !await Admin.exists({ _id: candidateId, tenantId: row.tenantId, role, staffStatus: 'active' }))
      return fail(res, 400, `请选择有效的${role}岗位人员`);
    row[field] = candidateId;
  }
  row.status = 'intake'; event(row, 'team_assigned', req.staff._id);
  await row.save(); res.json({ success: true, data: row });
});

router.post('/staff/:id/intake', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'managerId')) return fail(res, 403, '仅负责健管专员可整理资料');
  if (row.status !== 'intake') return fail(res, 409, '当前阶段不能提交资料');
  const summary = text(req.body?.summary);
  if (!summary) return fail(res, 400, '请填写已核实的资料摘要和待补资料');
  const reportIds = Array.isArray(req.body?.reportIds) ? [...new Set(req.body.reportIds.map(id))] : [];
  if (reportIds.length > 30 || reportIds.some(value => !valid(value))) return fail(res, 400, '关联报告编号无效或数量过多');
  if (reportIds.length && await MedicalReport.countDocuments({ _id: { $in: reportIds }, user: row.patientId }) !== reportIds.length)
    return fail(res, 400, '所选报告不属于该客户');
  row.materialSummary = summary;
  row.materialReportIds = reportIds;
  row.status = 'advisor'; event(row, 'intake_submitted', req.staff._id);
  await row.save(); res.json({ success: true, data: row });
});

router.post('/staff/:id/referral', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'advisorId')) return fail(res, 403, '仅负责健康顾问可写转介信');
  if (row.status !== 'advisor') return fail(res, 409, '当前阶段不能提交转介信');
  const purpose = text(req.body?.purpose), questions = text(req.body?.questions), context = text(req.body?.context);
  if (!purpose || !questions) return fail(res, 400, '请填写转介目的和需要专家回答的问题');
  row.referralPurpose = purpose; row.referralQuestions = questions; row.referralContext = context;
  row.referralPreparedAt = new Date(); row.status = 'planner'; event(row, 'referral_prepared', req.staff._id);
  await row.save(); res.json({ success: true, data: row });
});

router.post('/staff/:id/assign', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'plannerId')) return fail(res, 403, '仅负责健康规划师可确认专家');
  if (row.status !== 'planner') return fail(res, 409, '当前阶段不能派发转介信');
  const order = await Order.findById(row.orderId);
  if (!activeOrder(order)) return fail(res, 409, '订单已进入退款或取消流程，不能派单');
  const choices = Array.isArray(req.body?.members) ? req.body.members : [];
  const requestedExpertCount = row.type === 'mdt' ? Number(/^([2-8])位专家/.exec(order.specificationLabel || '')?.[1] || 2) : 1;
  if (choices.length !== requestedExpertCount)
    return fail(res, 400, '请按咨询类型选择专家人数');
  if (choices.some(x => !valid(x.expertId) || !valid(x.slotId)) || new Set(choices.map(x => id(x.expertId))).size !== choices.length)
    return fail(res, 400, '专家或空档时间重复、无效');
  const experts = await MedicalExpert.find({ _id: { $in: choices.map(x => x.expertId) }, status: 'active', teamEligible: true, linkedStaffId: { $ne: null },
    [row.type === 'mdt' ? 'mdtFee' : 'singleConsultationFee']: { $lte: 200 } }).lean();
  if (experts.length !== choices.length) return fail(res, 409, '部分专家不在可派发专家库');
  const activeStaffIds = await Admin.find({ _id: { $in: experts.map(x => x.linkedStaffId) }, staffStatus: 'active' }).select('_id').lean();
  if (activeStaffIds.length !== choices.length) return fail(res, 409, '部分专家医护端账号未启用');
  if (row.desiredExpertId && !choices.some(x => id(x.expertId) === id(row.desiredExpertId))) return fail(res, 409, '客户指定的专家未包含在安排中，请先与客户确认变更');
  const expertMap = new Map(experts.map(x => [id(x._id), x]));
  const selected = [];
  for (const choice of choices) {
    const expert = expertMap.get(id(choice.expertId));
    if (!expert?.serviceModes?.includes(row.type === 'mdt' ? 'mdt' : 'single_consultation')) return fail(res, 409, '专家未开通该咨询服务');
    const slot = await StaffAvailability.findOne({ _id: choice.slotId, staffId: expert.linkedStaffId, status: 'available' }).lean();
    if (!slot || slot.startAt < new Date() || slot.endAt - slot.startAt < 15 * 60000 || slot.endAt - slot.startAt > 30 * 60000) return fail(res, 409, '专家空档不存在或时长不适合本次咨询');
    selected.push({ expertId: expert._id, staffId: expert.linkedStaffId, slotId: slot._id, startAt: slot.startAt, endAt: slot.endAt });
  }
  selected.sort((a, b) => a.startAt - b.startAt);
  if (row.type === 'mdt' && selected.some((item, index) => index && item.startAt < selected[index - 1].endAt))
    return fail(res, 409, 'MDT 专家时段须依次安排，不能重叠');
  if (row.type === 'mdt') {
    const advisorSlot = valid(req.body?.advisorSlotId) && await StaffAvailability.findOne({ _id: req.body.advisorSlotId, staffId: row.advisorId, status: 'available' }).lean();
    const start = new Date(Math.min(...selected.map(x => +x.startAt))), end = new Date(Math.max(...selected.map(x => +x.endAt)));
    if (!advisorSlot || advisorSlot.startAt > start || advisorSlot.endAt < end) return fail(res, 409, 'MDT 须安排健康顾问覆盖全部专家时段');
    row.advisorSlotId = advisorSlot._id;
  } else {
    const managerSlot = valid(req.body?.managerSlotId) && await StaffAvailability.findOne({ _id: req.body.managerSlotId, staffId: row.managerId, status: 'available' }).lean();
    if (!managerSlot || managerSlot.startAt > selected[0].startAt || managerSlot.endAt < selected[0].endAt)
      return fail(res, 409, '单次咨询须安排健管专员覆盖专家时段');
    row.managerSlotId = managerSlot._id;
  }
  const meetingUrl = text(req.body?.meetingUrl, 500);
  if (meetingUrl && !/^https:\/\/[^\s]+$/i.test(meetingUrl)) return fail(res, 400, '会议链接须为有效的 HTTPS 地址');
  const reserved = [];
  let caseSaved = false;
  try {
    for (const slotId of [...selected.map(x => x.slotId), ...(row.advisorSlotId ? [row.advisorSlotId] : []), ...(row.managerSlotId ? [row.managerSlotId] : [])]) {
      const updated = await StaffAvailability.findOneAndUpdate({ _id: slotId, status: 'available' }, { $set: { status: 'booked', bookingId: row._id, source: 'consultation', updatedBy: req.staff._id } });
      if (!updated) throw new Error('预约时段已被占用');
      reserved.push(slotId);
    }
    row.members = selected; row.meetingUrl = meetingUrl;
    row.status = 'expert'; event(row, 'experts_dispatched', req.staff._id);
    await row.save();
    caseSaved = true;
    order.tradeStatus = 'fulfilling'; order.status = 'scheduled'; order.scheduledAt = selected[0].startAt;
    order.currentStage = 'expert'; order.currentAssignee = selected[0].staffId;
    order.supervisorId = row.plannerId; order.supervisionStatus = 'in_progress';
    await order.save();
  } catch (error) {
    if (caseSaved) return fail(res, 503, '专家已派发，订单同步暂未完成，请联系管理员处理');
    await StaffAvailability.updateMany({ _id: { $in: reserved }, bookingId: row._id }, { $set: { status: 'available', bookingId: null, source: 'self' } });
    return fail(res, 409, error.message || '预约失败，请刷新排班');
  }
  res.json({ success: true, data: row });
});

router.post('/staff/:id/meeting', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'plannerId')) return fail(res, 403, '仅健康规划师可维护会议链接');
  if (!['expert', 'reconcile'].includes(row.status)) return fail(res, 409, '当前阶段不能更新会议链接');
  const meetingUrl = text(req.body?.meetingUrl, 500);
  if (!/^https:\/\/[^\s]+$/i.test(meetingUrl)) return fail(res, 400, '会议链接须为有效的 HTTPS 地址');
  row.meetingUrl = meetingUrl; event(row, 'meeting_link_updated', req.staff._id);
  await row.save(); res.json({ success: true, data: row });
});

router.post('/staff/:id/reply', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (row.status !== 'expert') return fail(res, 409, '当前阶段不能回复转介信');
  const member = row.members.find(x => id(x.staffId) === id(req.staff._id));
  if (!member) return fail(res, 403, '仅获派发专家本人可回复');
  const opinion = text(req.body?.opinion), nextStep = text(req.body?.nextStep), noBetterOption = req.body?.noBetterOption === true;
  if (!opinion || !nextStep) return fail(res, 400, '即使没有更合适方案，也需写明分析依据和下一步');
  if (member.repliedAt) member.revisions.push({ opinion: member.opinion, nextStep: member.nextStep, noBetterOption: member.noBetterOption, repliedAt: member.repliedAt });
  member.opinion = opinion; member.nextStep = nextStep; member.noBetterOption = noBetterOption; member.repliedAt = new Date();
  event(row, 'expert_replied', req.staff._id);
  if (row.members.every(x => x.repliedAt)) row.status = 'reconcile';
  await row.save(); res.json({ success: true, data: row });
});

router.post('/staff/:id/reconcile', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'advisorId')) return fail(res, 403, '仅负责健康顾问可协调专家意见');
  if (row.status !== 'reconcile') return fail(res, 409, '请等待所有专家书面回复');
  const note = text(req.body?.note);
  if (!note) return fail(res, 400, '请写明各专科意见的一致点、矛盾及明确的下一步');
  if (req.body?.requestChanges === true) {
    row.members.forEach(x => { x.revisions.push({ opinion: x.opinion, nextStep: x.nextStep, noBetterOption: x.noBetterOption, repliedAt: x.repliedAt }); x.repliedAt = null; });
    row.status = 'expert'; event(row, 'conflict_returned', req.staff._id, note);
  } else {
    row.reconciliation = note; row.reconciliationAt = new Date(); row.status = 'followup'; event(row, 'opinions_reconciled', req.staff._id);
  }
  await row.save(); res.json({ success: true, data: row });
});

router.post('/staff/:id/followup', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'managerId')) return fail(res, 403, '仅负责健管专员可拟随访计划');
  if (row.status !== 'followup') return fail(res, 409, '当前阶段不能提交随访计划');
  const plan = text(req.body?.plan);
  if (!plan) return fail(res, 400, '请填写明确的管理路径和随访安排');
  row.followupPlan = plan; row.selfManaged = req.body?.selfManaged === true; row.status = 'final_review'; event(row, 'followup_drafted', req.staff._id);
  await row.save(); res.json({ success: true, data: row });
});

router.post('/staff/:id/complete', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'advisorId')) return fail(res, 403, '仅负责健康顾问可审核随访计划');
  if (row.status !== 'final_review') return fail(res, 409, '请等待健管专员提交随访计划');
  const order = await Order.findById(row.orderId);
  if (!activeOrder(order)) return fail(res, 409, '订单已进入退款或取消流程，不能结单');
  row.followupReviewedAt = new Date(); row.status = 'completed'; event(row, 'completed', req.staff._id);
  await row.save();
  order.status = 'completed'; order.tradeStatus = 'completed'; order.fulfillmentStatus = 'completed';
  order.usedUnits = 1; order.completedAt = row.followupReviewedAt;
  order.currentStage = 'completed'; order.currentAssignee = null; order.supervisionStatus = 'completed';
  await order.save();
  await Fulfillment.findOneAndUpdate({ order: order._id }, { $set: { status: 'completed', completedAt: order.completedAt },
    $setOnInsert: { order: order._id, user: order.user, type: order.fulfillmentType || 'remote_service' } }, { upsert: true });
  res.json({ success: true, data: row });
});

module.exports = router;
