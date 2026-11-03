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
const Referral = require('../models/Referral');

const id = value => String(value?._id || value || '');
const text = (value, max = 4000) => String(value || '').trim().slice(0, max);
const fail = (res, code, message) => res.status(code).json({ success: false, message });
const valid = value => mongoose.isValidObjectId(value);
const paid = order => order?.paymentStatus === 'paid' && ['paid', 'fulfilling', 'completed', 'partially_refunded'].includes(order.tradeStatus);
const serviceType = order => ({ expert_consultation: 'single', mdt_consultation: 'mdt' })[order?.serviceWorkflowSnapshot?.key];
const activeOrder = order => paid(order) && order?.status !== 'cancelled' && !['requested', 'processing', 'refunded'].includes(order?.refundStatus);
const event = (row, action, actorId, note = '') => row.history.push({ action, actorId, at: new Date(), note: text(note, 500) });
const effectiveStatus = row => row.initiationSource === 'staff' && row.status === 'team_assignment' && row.managerId ? 'intake' : row.status;
const staffCanRead = (row, staff) => staff.role === 'superadmin'
  || (staff.role === 'healthPlanner' && row.initiationSource !== 'staff' && row.status === 'team_assignment' && !row.plannerId)
  || [row.initiatedByStaff, row.managerId, row.advisorId, row.plannerId, ...row.members.map(x => x.staffId)].some(x => id(x) === id(staff._id));
const assigned = (row, staff, field) => staff.role === 'superadmin' || id(row[field]) === id(staff._id);
const availableReferral = row => ({ patientId: row.patientId, fromStaffId: row.advisorId,
  referralType: 'external_medical', status: { $in: ['pending', 'accepted'] },
  $or: [{ sourceOrderId: null }, ...(row.orderId ? [{ sourceOrderId: row.orderId }] : [])] });
const referralFields = 'reason content referralPurpose questionList medicalExpertId medicalExpertSnapshot expertConsultationCaseId status createdAt contentVersion';
async function eligibleExpertRows(row) {
  const fee = row.type === 'mdt' ? 'mdtFee' : 'singleConsultationFee';
  const mode = row.type === 'mdt' ? 'mdt' : 'single_consultation';
  const experts = await MedicalExpert.find({ status: 'active', teamEligible: true, linkedStaffId: { $ne: null },
    serviceModes: mode, [fee]: { $lte: 200 } }).select('_id name title linkedStaffId serviceModes singleConsultationFee mdtFee').lean();
  const active = await Admin.find({ _id: { $in: experts.map(item => item.linkedStaffId) },
    tenantId: row.tenantId, staffStatus: 'active' }).select('_id').lean();
  const activeIds = new Set(active.map(item => id(item._id)));
  return experts.filter(item => activeIds.has(id(item.linkedStaffId)));
}
async function eligibleReferralExperts(row) { return new Set((await eligibleExpertRows(row)).map(item => id(item._id))); }

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
      status: 'team_assignment',
      clientRequest: request, desiredExpertId, history: [{ action: 'requested', actorId: req.user._id, at: new Date(), note: '' }] });
  } catch (error) {
    if (error.code !== 11000) throw error;
    row = await Case.findOne({ orderId: order._id });
  }
  res.status(201).json({ success: true, data: { id: row._id, status: row.status } });
});

router.post('/staff', staffAuth, async (req, res) => {
  if (!['healthManager', 'familyDoctor', 'healthPlanner', 'superadmin'].includes(req.staff.role))
    return fail(res, 403, '仅健管专员、健康顾问或健康规划师可发起咨询');
  if (!valid(req.body?.patientId)) return fail(res, 400, '请选择客户');
  const type = req.body?.type;
  if (!['single', 'mdt'].includes(type)) return fail(res, 400, '请选择单次专家咨询或 MDT');
  const request = text(req.body?.request, 1500);
  if (!request) return fail(res, 400, '请填写本次咨询问题');
  const expertCount = type === 'mdt' ? Number(req.body?.expertCount) : 1;
  if (type === 'mdt' && ![2, 3].includes(expertCount)) return fail(res, 400, 'MDT 请选择 2 位或 3 位专家');
  const patient = await User.findOne({ _id: req.body.patientId, tenantId: req.staff.tenantId, isDeleted: { $ne: true } })
    .select('assignedHealthManager assignedFamilyDoctor assignedHealthPlanner');
  if (!patient) return fail(res, 404, '客户不存在或不属于本机构');
  if (req.staff.role !== 'superadmin' && ![patient.assignedHealthManager, patient.assignedFamilyDoctor,
    patient.assignedHealthPlanner].some(staffId => id(staffId) === id(req.staff._id)))
    return fail(res, 403, '只能为本人负责的客户发起咨询');
  const managerId = patient.assignedHealthManager;
  if (!managerId || !await Admin.exists({ _id: managerId, tenantId: req.staff.tenantId, role: 'healthManager', staffStatus: 'active' }))
    return fail(res, 409, '客户所属健管专员资料异常，请先修正客户归属后发起');
  const advisorId = patient.assignedFamilyDoctor;
  const plannerId = patient.assignedHealthPlanner;
  const row = await Case.create({ tenantId: req.staff.tenantId, patientId: patient._id, type,
    initiationSource: 'staff', initiatedByStaff: req.staff._id,
    specificationLabel: type === 'mdt' ? `${expertCount}位专家` : '', managerId, advisorId, plannerId,
    status: 'intake', clientRequest: request,
    history: [{ action: 'staff_requested', actorId: req.staff._id, at: new Date(), note: '' }] });
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
  res.json({ success: true, data: rows.map(row => ({ id: row._id, orderId: row.orderId, type: row.type, status: effectiveStatus(row),
    clientRequest: row.clientRequest, meetingUrl: row.meetingUrl, scheduledAt: row.members[0]?.startAt || null,
    managementPath: row.status === 'completed' ? row.reconciliation : '', followupPlan: row.status === 'completed' ? row.followupPlan : '' })) });
});

router.get('/staff', staffAuth, async (req, res) => {
  const filter = req.staff.role === 'superadmin' ? {} : { $or: [
    { initiatedByStaff: req.staff._id }, { managerId: req.staff._id }, { advisorId: req.staff._id },
    { plannerId: req.staff._id }, { 'members.staffId': req.staff._id },
    ...(req.staff.role === 'healthPlanner' ? [{ status: 'team_assignment', plannerId: null, initiationSource: { $ne: 'staff' } }] : []),
  ] };
  const rows = await Case.find(filter).sort({ createdAt: -1 }).limit(200)
    .populate('patientId', 'name phone').populate('referralId', referralFields)
    .populate('managerId advisorId plannerId', 'name role')
    .populate('confirmedExpertIds plannedExpertIds', 'name title')
    .populate('members.expertId', 'name title').lean();
  res.json({ success: true, data: rows.map(row => ({ ...row, status: effectiveStatus(row) })) });
});

router.get('/staff/experts', staffAuth, async (req, res) => {
  if (!['healthManager', 'familyDoctor', 'healthPlanner', 'superadmin'].includes(req.staff.role)) return fail(res, 403, '无权查看咨询专家库');
  const rows = await MedicalExpert.find({ status: 'active', teamEligible: true, linkedStaffId: { $ne: null } })
    .select('_id name title institutionId departmentId linkedStaffId serviceModes singleConsultationFee mdtFee').lean();
  const active = await Admin.find({ _id: { $in: rows.map(x => x.linkedStaffId) }, staffStatus: 'active' }).select('_id').lean();
  const activeIds = new Set(active.map(x => id(x)));
  res.json({ success: true, data: rows.filter(x => activeIds.has(id(x.linkedStaffId))) });
});

router.get('/staff/:id/experts', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!['advisorId', 'managerId', 'plannerId'].some(field => assigned(row, req.staff, field)))
    return fail(res, 403, '仅本次负责人员可查看可选专家');
  if (!['intake', 'advisor', 'planner'].includes(effectiveStatus(row))) return fail(res, 409, '当前阶段不能选择专家');
  res.json({ success: true, data: await eligibleExpertRows(row) });
});

// Loading the task list never marks a referral as viewed.
router.get('/staff/:id/referral-detail', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row || !staffCanRead(row, req.staff)) return fail(res, 403, '无权查看本次转介信');
  const referral = await Referral.findOne({ _id: row.referralId, patientId: row.patientId })
    .select('reason questionList content urgency contentVersion attachedHealthInfo linkedDiseaseSnapshots linkedDiseaseSnapshot sourceReports').lean();
  if (!referral) return fail(res, 404, '尚未关联转介信');
  res.json({ success: true, data: { ...referral, contentVersion: referral.contentVersion || 0 } });
});

router.post('/staff/:id/referral-viewed', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row || !row.members.some(member => id(member.staffId) === id(req.staff._id)))
    return fail(res, 403, '仅本次已派发专家本人可记录查看');
  const referral = await Referral.findOne({ _id: row.referralId, patientId: row.patientId }).select('contentVersion').lean();
  if (!referral || id(referral) !== req.body.referralId || (referral.contentVersion || 0) !== req.body.contentVersion)
    return fail(res, 409, '转介资料已更新，请重新打开查看');
  const member = row.members.find(member => id(member.staffId) === id(req.staff._id));
  if (id(member.viewedReferralId) === id(referral) && member.viewedVersion === (referral.contentVersion || 0) && member.viewedAt)
    return res.json({ success: true, data: { viewedAt: member.viewedAt } });
  const viewedAt = new Date();
  const recorded = await Case.updateOne({ _id: row._id, __v: row.__v, referralId: referral._id, 'members.staffId': req.staff._id }, { $set: {
    'members.$.viewedAt': viewedAt, 'members.$.viewedReferralId': referral._id,
    'members.$.viewedVersion': referral.contentVersion || 0,
  }, $inc: { __v: 1 } });
  if (!recorded.modifiedCount) return fail(res, 409, '服务状态已更新，请重新打开转介信');
  res.json({ success: true, data: { viewedAt } });
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

router.get('/staff/:id/referrals', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'advisorId')) return fail(res, 403, '仅负责健康顾问可选择转介');
  if (!['intake', 'advisor', 'planner'].includes(effectiveStatus(row))) return fail(res, 409, '当前阶段不能关联转介');
  const eligibleIds = await eligibleReferralExperts(row);
  const referrals = await Referral.find(availableReferral(row)).select(referralFields).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: referrals.filter(item =>
    (!item.expertConsultationCaseId || id(item.expertConsultationCaseId) === id(row._id)) && eligibleIds.has(id(item.medicalExpertId))) });
});

router.post('/staff/:id/edit', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'managerId') && !assigned(row, req.staff, 'advisorId')) return fail(res, 403, '仅负责健管专员或健康顾问可修改咨询需求');
  if (!['team_assignment', 'intake', 'advisor', 'planner'].includes(row.status)) return fail(res, 409, '专家已派发，不能直接修改客户需求');
  const request = text(req.body?.request, 1500);
  if (!request) return fail(res, 400, '请填写本次咨询问题');
  if (request !== row.clientRequest) {
    event(row, 'request_updated', req.staff._id, `原需求：${text(row.clientRequest, 220)}；新需求：${text(request, 220)}`);
    row.clientRequest = request;
    if (['advisor', 'planner'].includes(row.status)) {
      row.confirmedExpertIds = []; row.expertsConfirmedAt = null; row.status = 'advisor';
    }
    await row.save();
  }
  res.json({ success: true, data: row });
});

router.post('/staff/:id/team', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (req.staff.role !== 'superadmin' && id(row.plannerId) !== id(req.staff._id)
    && !(req.staff.role === 'healthPlanner' && !row.plannerId)) return fail(res, 403, '仅负责人可分配服务团队');
  if (row.status !== 'team_assignment') return fail(res, 409, '当前阶段不能分配团队');
  if (row.initiationSource === 'staff') return fail(res, 409, '医护端发起由客户所属健管专员直接承接，无需首次派单');
  const candidateId = req.body?.managerId || row.managerId;
  if (!valid(candidateId) || !await Admin.exists({ _id: candidateId, tenantId: row.tenantId, role: 'healthManager', staffStatus: 'active' }))
    return fail(res, 400, '请选择有效的健管专员');
  row.managerId = candidateId;
  const patient = await User.findById(row.patientId).select('assignedFamilyDoctor');
  row.advisorId = patient?.assignedFamilyDoctor || row.advisorId;
  if (!row.plannerId) row.plannerId = req.staff._id;
  row.status = 'intake'; event(row, 'team_assigned', req.staff._id);
  await row.save(); res.json({ success: true, data: row });
});

router.post('/staff/:id/intake', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'managerId')) return fail(res, 403, '仅负责健管专员可整理资料');
  if (effectiveStatus(row) !== 'intake') return fail(res, 409, '当前阶段不能提交资料');
  const patient = await User.findById(row.patientId).select('assignedFamilyDoctor');
  const advisorId = patient?.assignedFamilyDoctor || row.advisorId;
  if (!advisorId || !await Admin.exists({ _id: advisorId, tenantId: row.tenantId, role: 'familyDoctor', staffStatus: 'active' }))
    return fail(res, 409, '请先在客户档案确认有效的所属健康顾问，再提交资料');
  row.advisorId = advisorId;
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
  if (!assigned(row, req.staff, 'advisorId')) return fail(res, 403, '仅负责健康顾问可关联转介信');
  if (!(req.body.submitToManager ? ['intake', 'advisor', 'planner'] : ['intake', 'advisor', 'planner']).includes(effectiveStatus(row))) return fail(res, 409, '专家派发后不能更换转介信');
  if (!valid(req.body?.referralId)) return fail(res, 400, '请先在客户档案中发起转介，再选择该转介记录');
  if (!req.body.submitToManager && id(row.referralId) === id(req.body.referralId)) return res.json({ success: true, data: row });
  const eligibleIds = await eligibleReferralExperts(row);
  const candidate = await Referral.findOne({ _id: req.body.referralId, ...availableReferral(row), expertConsultationCaseId: { $in:[null,row._id] } }).lean();
  if (!candidate) return fail(res, 409, '转介记录不存在、已结束、已关联其他咨询或不属于本次客户与健康顾问');
  if (!eligibleIds.has(id(candidate.medicalExpertId))) return fail(res, 409, '转介所选专家尚未开通本咨询类型、有效医护账号或符合报价，不能派发');
  let submittedIds = [];
  if (req.body.submitToManager) {
    if (req.body.materialsReviewed !== true) return fail(res, 400, '请确认已审核本次转介资料与会诊诉求');
    if (candidate.status !== 'pending') return fail(res, 409, '该转介已被接收，请先协调原转介，不可重复安排');
    if (!candidate.reason?.trim() || !candidate.questionList?.trim()) return fail(res, 400, '请补齐转介原因和需要解决的问题');
    if (!await Admin.exists({ _id:row.managerId, tenantId:row.tenantId, role:'healthManager', staffStatus:'active' })) return fail(res,409,'本次健管专员无效，请先确认客户负责人');
    submittedIds = Array.isArray(req.body.expertIds) && req.body.expertIds.length ? req.body.expertIds.map(id) : [id(candidate.medicalExpertId)];
    const count = row.type === 'mdt' ? Number(/^([2-8])位专家/.exec(row.specificationLabel || '')?.[1] || 2) : 1;
    if (submittedIds.length !== count || new Set(submittedIds).size !== count || submittedIds.some(x => !eligibleIds.has(x)) || !submittedIds.includes(id(candidate.medicalExpertId)) || (row.desiredExpertId && !submittedIds.includes(id(row.desiredExpertId)))) return fail(res,400,'请确认本次所需专家名单，包含转介信及客户指定的专家');
    const issue = await require('../utils/consultationMaterialGate')(row,candidate);
    if (issue) return fail(res,409,issue);
  }
  const referral = await Referral.findOneAndUpdate({ _id: req.body.referralId, ...availableReferral(row), ...(req.body.submitToManager ? {status:'pending'} : {}), expertConsultationCaseId: { $in:[null,row._id] } },
    { $set: { expertConsultationCaseId: row._id } }, { new: true });
  if (!referral) return fail(res, 409, '转介记录不存在、已结束、已关联其他咨询或不属于本次客户与健康顾问');
  const previousReferralId = row.referralId;
  row.referralId = referral._id;
  row.referralPreparedAt = new Date(); row.status = 'advisor';
  row.confirmedExpertIds = submittedIds; row.expertsConfirmedAt = req.body.submitToManager ? new Date() : null;
  if (req.body.submitToManager) { row.status='planner'; event(row,'advisor_submitted_to_manager',req.staff._id,'资料已审核，交专员协调预约'); }
  event(row, previousReferralId ? 'referral_replaced' : 'referral_prepared', req.staff._id);
  try { await row.save(); }
  catch (error) { await Referral.updateOne({ _id: referral._id, expertConsultationCaseId: row._id }, { $set: { expertConsultationCaseId: candidate.expertConsultationCaseId || null } }); throw error; }
  if (previousReferralId && id(previousReferralId) !== id(referral._id)) {
    await Referral.updateOne({ _id: previousReferralId, expertConsultationCaseId: row._id }, { $set: { expertConsultationCaseId: null } });
    const previous = await Referral.findById(previousReferralId);
    if (previous) await require('../utils/referralAssessmentWorkflow').createReferralWorkbenchTask(previous);
  }
  await require('../models/FollowUp').updateMany({ sourceType: 'professional_assessment', sourceId: referral._id,
    workflowKey: 'professional_assessment:professional_review', status: { $in: ['planned', 'in_progress', 'missed'] } },
  { $set: { status: 'cancelled', cancelReason: '已转入专家咨询服务处理' } });
  res.json({ success: true, data: row });
});

router.post('/staff/:id/confirm-experts', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'advisorId')) return fail(res, 403, '仅负责健康顾问可确认专家');
  if (!['advisor', 'planner'].includes(row.status)) return fail(res, 409, '当前阶段不能确认专家');
  const ids = Array.isArray(req.body?.expertIds) ? req.body.expertIds.map(id) : [];
  const count = row.type === 'mdt' ? Number(/^([2-8])位专家/.exec(row.specificationLabel || '')?.[1] || 2) : 1;
  if (ids.length !== count || new Set(ids).size !== count || ids.some(x => !valid(x))) return fail(res, 400, '请按咨询人数选择不同的专家');
  const eligible = await eligibleReferralExperts(row);
  if (ids.some(x => !eligible.has(x))) return fail(res, 409, '部分专家不符合本次服务类型、账号或报价要求');
  if (row.desiredExpertId && !ids.includes(id(row.desiredExpertId))) return fail(res, 409, '须包含客户指定的专家');
  if (row.referralId) {
    const referral = await Referral.findOne({ _id: row.referralId, ...availableReferral(row) });
    if (!referral || (referral.medicalExpertId && !ids.includes(id(referral.medicalExpertId)))) return fail(res, 409, '请核实转介信，并包含转介信所选专家');
  } else if (!row.referralPurpose || !row.referralQuestions) return fail(res, 409, '请先关联转介信');
  row.confirmedExpertIds = ids; row.expertsConfirmedAt = new Date(); row.expertChangeReason = '';
  row.status = 'planner'; event(row, 'advisor_confirmed_experts', req.staff._id);
  await row.save(); res.json({ success: true, data: row });
});

router.post('/staff/:id/request-expert-change', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  if (!assigned(row, req.staff, 'managerId')) return fail(res, 403, '仅负责健管专员可反馈预约问题');
  if (row.status !== 'planner') return fail(res, 409, '仅预约前可申请调整专家');
  const reason = text(req.body?.reason, 1000);
  if (!reason) return fail(res, 400, '请填写调整原因及建议');
  row.expertChangeReason = reason; row.confirmedExpertIds = []; row.expertsConfirmedAt = null;
  row.status = 'advisor'; event(row, 'expert_change_requested', req.staff._id, reason);
  await row.save(); res.json({ success: true, data: row });
});

router.post('/staff/:id/assign', staffAuth, async (req, res) => {
  const row = valid(req.params.id) && await Case.findById(req.params.id);
  if (!row) return fail(res, 404, '咨询服务不存在');
  const direct = req.body.directConfirmed === true;
  if (direct) {
    if (!assigned(row, req.staff, 'advisorId')) return fail(res, 403, '仅负责健康顾问可直接确认预约');
    if (!['intake', 'advisor', 'planner'].includes(effectiveStatus(row))) return fail(res, 409, '当前阶段不能重复预约或推送');
    if (req.body.materialsReviewed !== true || req.body.partiesConfirmed !== true) return fail(res, 400, '请确认已审核资料，并已与客户及专家确认具体时间');
    if (!Array.isArray(req.body.members) || req.body.members.some(x => !x || !valid(x.expertId))) return fail(res, 400, '请选择有效的专家和时间');
    row.confirmedExpertIds = req.body.members.map(x => x.expertId);
    row.expertsConfirmedAt = new Date();
  } else {
    if (!assigned(row, req.staff, 'managerId')) return fail(res, 403, '仅负责健管专员可安排预约并推送转介信');
    if (row.status !== 'planner') return fail(res, 409, '当前阶段不能派发转介信');
    if (!row.expertsConfirmedAt || !row.confirmedExpertIds?.length) return fail(res, 409, '请先由健康顾问确认专家名单');
  }
  if (row.referralId) {
    const referral = await Referral.findOne({ _id: row.referralId, ...availableReferral(row) });
    if (!referral) return fail(res, 409, '关联转介已结束或变更，请由健康顾问核对');
    if (direct && (!referral.reason?.trim() || !referral.questionList?.trim())) return fail(res, 400, '请补齐转介原因和需要解决的问题');
    if (referral.medicalExpertId && !req.body?.members?.some(member => id(member.expertId) === id(referral.medicalExpertId)))
      return fail(res, 409, '派发专家须包含现有转介信所选专家');
  } else if (!row.referralPurpose || !row.referralQuestions) {
    return fail(res, 409, '请先关联客户已有转介信');
  }
  const order = row.initiationSource === 'staff' ? null : await Order.findById(row.orderId);
  if (row.initiationSource !== 'staff' && !activeOrder(order)) return fail(res, 409, '订单已进入退款或取消流程，不能派单');
  const choices = Array.isArray(req.body?.members) ? req.body.members : [];
  if (choices.length !== row.confirmedExpertIds.length || choices.some(x => !row.confirmedExpertIds.some(confirmed => id(confirmed) === id(x.expertId))))
    return fail(res, 409, '只能预约健康顾问已确认的专家，需要更换时请退回顾问确认');
  const requestedExpertCount = row.type === 'mdt' ? Number(/^([2-8])位专家/.exec(row.specificationLabel || order?.specificationLabel || '')?.[1] || 2) : 1;
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
  } else if (!direct) {
    const managerSlot = valid(req.body?.managerSlotId) && await StaffAvailability.findOne({ _id: req.body.managerSlotId, staffId: row.managerId, status: 'available' }).lean();
    if (!managerSlot || managerSlot.startAt > selected[0].startAt || managerSlot.endAt < selected[0].endAt)
      return fail(res, 409, '单次咨询须安排健管专员覆盖专家时段');
    row.managerSlotId = managerSlot._id;
  }
  const meetingUrl = text(req.body?.meetingUrl, 500);
  if (meetingUrl && !/^https:\/\/[^\s]+$/i.test(meetingUrl)) return fail(res, 400, '会议链接须为有效的 HTTPS 地址');
  const materialIssue = await require('../utils/consultationMaterialGate')(row, row.referralId ? await Referral.findById(row.referralId) : null);
  if (materialIssue) return fail(res,409,materialIssue);
  const reserved = [];
  let caseSaved = false;
  try {
    for (const slotId of [...selected.map(x => x.slotId), ...(row.advisorSlotId ? [row.advisorSlotId] : []), ...(row.managerSlotId ? [row.managerSlotId] : [])]) {
      const updated = await StaffAvailability.findOneAndUpdate({ _id: slotId, status: 'available' }, { $set: { status: 'booked', bookingId: row._id, source: 'consultation', updatedBy: req.staff._id } });
      if (!updated) throw new Error('预约时段已被占用');
      reserved.push(slotId);
    }
    row.members = selected.map(member => ({ ...member, dispatchedAt: new Date() })); row.meetingUrl = meetingUrl;
    row.status = 'expert'; event(row, direct ? 'advisor_direct_dispatch' : 'experts_dispatched', req.staff._id);
    await row.save();
    caseSaved = true;
    if (order) {
      order.tradeStatus = 'fulfilling'; order.status = 'scheduled'; order.scheduledAt = selected[0].startAt;
      order.currentStage = 'expert'; order.currentAssignee = selected[0].staffId;
      order.supervisorId = row.plannerId; order.supervisionStatus = 'in_progress';
      await order.save();
    }
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
  if (!assigned(row, req.staff, 'managerId')) return fail(res, 403, '仅负责健管专员可维护会议链接');
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
  const order = row.initiationSource === 'staff' ? null : await Order.findById(row.orderId);
  if (row.initiationSource !== 'staff' && !activeOrder(order)) return fail(res, 409, '订单已进入退款或取消流程，不能结单');
  row.followupReviewedAt = new Date(); row.status = 'completed'; event(row, 'completed', req.staff._id);
  await row.save();
  if (order) {
    order.status = 'completed'; order.tradeStatus = 'completed'; order.fulfillmentStatus = 'completed';
    order.usedUnits = 1; order.completedAt = row.followupReviewedAt;
    order.currentStage = 'completed'; order.currentAssignee = null; order.supervisionStatus = 'completed';
    await order.save();
    await Fulfillment.findOneAndUpdate({ order: order._id }, { $set: { status: 'completed', completedAt: order.completedAt },
      $setOnInsert: { order: order._id, user: order.user, type: order.fulfillmentType || 'remote_service' } }, { upsert: true });
  }
  res.json({ success: true, data: row });
});

module.exports = router;
