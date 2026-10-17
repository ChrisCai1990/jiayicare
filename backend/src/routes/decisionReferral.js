// 企业家健康决策计划：订单、预约与专科转介使用同一条可追溯服务链。
const router = require('express').Router();
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const staffAuth = require('../middleware/staffAuth');
const Order = require('../models/Order');
const FollowUp = require('../models/FollowUp');
const User = require('../models/User');
const Referral = require('../models/Referral');
const MedicalExpert = require('../models/MedicalExpert');
const Admin = require('../models/Admin');
const Fulfillment = require('../models/Fulfillment');
const MedicalReport = require('../models/MedicalReport');
const { signStoredUrl } = require('../utils/oss');

const id = value => String(value?._id || value || '');
const isDecisionOrder = order => order?.serviceName === '企业家健康决策计划';
const taskId = (orderId, stage) => new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`decision-referral:${orderId}:${stage}`).digest('hex').slice(0, 24));
const labels = {
  advisor: '企业家健康决策计划 · 顾问确定解析方案并转介',
  booking: '企业家健康决策计划 · 健管预约与客户沟通',
  specialist: '企业家健康决策计划 · 专科解析并回复转介',
  advisor_review: '企业家健康决策计划 · 顾问审核专科回复并归档',
  planner_final: '企业家健康决策计划 · 规划师最终验收',
};
const roles = { intake: 'healthPlanner', advisor: 'familyDoctor', booking: 'healthManager',
  specialist: 'specialist', advisor_review: 'familyDoctor', planner_final: 'healthPlanner' };
const next = { intake: 'advisor', advisor: 'booking', booking: 'specialist', advisor_review: 'planner_final', planner_final: 'completed' };
const fail = (message, statusCode = 409) => { throw Object.assign(new Error(message), { statusCode }); };
const clean = (value, max = 2000) => String(value || '').trim().slice(0, max);
const serviceDate = value => {
  const raw = String(value || '').trim();
  return new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(raw) ? `${raw}+08:00` : raw);
};
const activeOrder = order => ['pending', 'scheduled'].includes(order.status)
  && ['paid', 'fulfilling', 'partially_refunded'].includes(order.tradeStatus)
  && ['', 'none', 'failed', 'partially_refunded', null, undefined].includes(order.refundStatus)
  && (order.paymentStatus === 'paid' || (order.initiationSource === 'staff_direct'
    && order.paymentStatus === 'unpaid' && Number(order.servicePrice) === 0));
const current = order => order.decisionReferral?.stage || 'intake';
const stageOf = task => String(task.workflowKey || '').startsWith('decision_referral:')
  ? String(task.workflowKey).split(':')[1] : '';

async function ensureTask(order, patient, stage, assignee) {
  if (!assignee) fail(`客户尚未分配${({ advisor: '健康顾问', booking: '健管专员', specialist: '专科医生', advisor_review: '健康顾问', planner_final: '健康规划师' })[stage]}`);
  const now = new Date();
  return FollowUp.findOneAndUpdate(
    { _id: taskId(order._id, stage) },
    { $setOnInsert: {
      patientId: patient._id, tenantId: patient.tenantId || null, sourceType: 'order', sourceOrderId: order._id,
      staffId: assignee, assignedTo: assignee, taskRole: 'executor', workflowKey: `decision_referral:${stage}`,
      type: 'other', status: 'planned', date: now, remindAt: now, theme: labels[stage],
      plannedContent: labels[stage], content: labels[stage], isBlocked: stage === 'specialist',
      coordinationGroupId: `decision-referral:${order._id}`,
    } },
    { upsert: true, new: true },
  );
}

async function ensureAdvisorReview(order) {
  if (current(order) !== 'specialist' || !order.decisionReferral?.booking?.confirmedAt) return;
  const referral = await Referral.findById(order.decisionReferral.referralId).lean();
  if (referral?.status !== 'completed') return;
  const patient = await User.findById(order.user).select('tenantId assignedFamilyDoctor').lean();
  if (!patient) fail('客户档案不存在');
  await ensureTask(order, patient, 'advisor_review', patient.assignedFamilyDoctor);
  await Order.updateOne({ _id: order._id, 'decisionReferral.stage': 'specialist' },
    { $set: { 'decisionReferral.stage': 'advisor_review', currentStage: 'advisor_review', currentAssignee: patient.assignedFamilyDoctor } });
}

async function onReferralFeedback(referral) {
  if (!referral.sourceOrderId || referral.status !== 'completed') return;
  const order = await Order.findById(referral.sourceOrderId);
  if (!isDecisionOrder(order) || !activeOrder(order) || id(order.decisionReferral?.referralId) !== id(referral)) return;
  if (current(order) === 'planner_final'
    && (referral.feedbackVersion || 0) !== order.decisionReferral?.archive?.referralFeedbackVersion) {
    const patient = await User.findById(order.user).select('assignedFamilyDoctor').lean();
    if (!patient?.assignedFamilyDoctor) fail('专科回复已修订，但客户尚未分配健康顾问，请先补充负责人');
    const returned = await Order.updateOne({ _id: order._id, status: { $in: ['pending', 'scheduled'] },
      'decisionReferral.stage': 'planner_final' }, { $set: { 'decisionReferral.stage': 'advisor_review',
        currentStage: 'advisor_review', currentAssignee: patient.assignedFamilyDoctor },
      $unset: { 'decisionReferral.archive': '' } });
    if (returned.modifiedCount) await FollowUp.updateOne({ _id: taskId(order._id, 'advisor_review') },
      { $set: { status: 'planned', completedAt: null, completedBy: null,
        executedContent: '专科更新了解析回复，请顾问重新审核归档。', date: new Date(), remindAt: new Date() } });
  }
  await FollowUp.updateOne({ _id: taskId(order._id, 'specialist'), status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { status: 'completed', isBlocked: false, completedAt: referral.respondedAt || new Date(),
      completedBy: 'staff', executedContent: '专科已在原转介中提交报告解析反馈。' } });
  await ensureAdvisorReview(order);
}

async function validateFeedbackWindow(referral) {
  if (!referral.sourceOrderId) return;
  const order = await Order.findById(referral.sourceOrderId).select('serviceName status tradeStatus paymentStatus refundStatus initiationSource servicePrice decisionReferral');
  if (!isDecisionOrder(order) || !activeOrder(order)) fail('原订单已结束或不可办理，不能提交专科回复');
  if (!order.decisionReferral?.booking?.confirmedAt
    || !['specialist', 'advisor_review', 'planner_final'].includes(current(order)))
    fail('健管预约尚未确认，暂不能提交专科解析回复');
  if (id(order.decisionReferral.referralId) !== id(referral)) fail('转介与原订单不匹配');
}

router.get('/tasks/:id', staffAuth, async (req, res) => {
  try {
    const task = await FollowUp.findById(req.params.id).lean();
    if (!task || task.sourceType !== 'order' || !task.sourceOrderId) fail('服务任务不存在', 404);
    const order = await Order.findById(task.sourceOrderId).lean();
    if (!isDecisionOrder(order)) fail('此任务不属于企业家健康决策计划', 404);
    const patient = await User.findById(order.user).select('tenantId assignedFamilyDoctor assignedHealthManager assignedHealthPlanner').lean();
    if (!patient || id(patient.tenantId) !== id(req.staff.tenantId)) fail('无权查看此服务', 403);
    const team = [patient.assignedFamilyDoctor, patient.assignedHealthManager, patient.assignedHealthPlanner,
      order.supervisorId, order.decisionReferral?.plan?.specialistStaffId];
    if (req.staff.role !== 'superadmin' && !team.some(value => id(value) === id(req.staff))) fail('无权查看此服务', 403);
    const referral = order.decisionReferral?.referralId
      ? await Referral.findById(order.decisionReferral.referralId).select('status response responseAnalysis responseOpinion respondedAt feedbackVersion medicalExpertSnapshot courseDraftStatus feedbackRevisionRequest').lean()
      : null;
    res.json({ success: true, data: { orderId: order._id, stage: current(order), workflow: order.decisionReferral || null,
      referral, taskStatus: task.status, taskStage: stageOf(task) || (task.workflowKey ? '' : 'intake') } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : '读取服务进度失败' });
  }
});

router.get('/referrals/:id/reports/:reportId', staffAuth, async (req, res) => {
  try {
    const referral = await Referral.findById(req.params.id).select('patientId sourceOrderId fromStaffId toStaffId sourceReports').lean();
    if (!referral || !referral.sourceOrderId || !referral.sourceReports?.some(row => id(row.reportId) === req.params.reportId))
      fail('本次转介未授权该报告', 404);
    if (req.staff.role !== 'superadmin' && ![referral.fromStaffId, referral.toStaffId].some(value => id(value) === id(req.staff)))
      fail('无权查看本次转介报告', 403);
    const order = await Order.findById(referral.sourceOrderId).select('tenantId user serviceName').lean();
    const patient = order && await User.findById(order.user).select('tenantId').lean();
    if (!isDecisionOrder(order) || !patient || id(patient.tenantId) !== id(req.staff.tenantId)
      || (order.tenantId && id(order.tenantId) !== id(patient.tenantId)) || id(order.user) !== id(referral.patientId))
      fail('本次转介与服务不匹配', 403);
    const report = await MedicalReport.findOne({ _id: req.params.reportId, user: referral.patientId })
      .select('fileUrl fileUrls ossKey ossKeys title').lean();
    if (!report) fail('报告原件已不存在', 404);
    const url = report.fileUrls?.[0] || report.fileUrl;
    const key = report.ossKeys?.[0] || report.ossKey || '';
    if (!url) fail('报告缺少原件', 404);
    res.json({ success: true, data: { title: report.title, url: signStoredUrl(url, key) } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : '读取转介报告失败' });
  }
});

router.post('/tasks/:id/request-revision', staffAuth, async (req, res) => {
  try {
    const task = await FollowUp.findById(req.params.id).lean();
    if (!task || stageOf(task) !== 'advisor_review' || !['planned', 'in_progress', 'missed'].includes(task.status))
      fail('顾问审核任务不存在或已完成', 404);
    const order = await Order.findById(task.sourceOrderId).lean();
    const patient = order && await User.findById(order.user).select('tenantId assignedFamilyDoctor').lean();
    if (!isDecisionOrder(order) || !activeOrder(order) || current(order) !== 'advisor_review' || !patient)
      fail('服务状态已变化，请刷新');
    if (id(patient.tenantId) !== id(req.staff.tenantId) || (req.staff.role !== 'superadmin'
      && (req.staff.role !== 'familyDoctor' || id(patient.assignedFamilyDoctor) !== id(req.staff)))) fail('仅本服务健康顾问可退回', 403);
    const note = clean(req.body?.note, 2000);
    if (!note) fail('请填写需要专科补充的具体内容', 400);
    const referral = await Referral.findOneAndUpdate({ _id: order.decisionReferral.referralId, status: 'completed',
      'feedbackRevisionRequest.pending': { $ne: true } }, { $set: { feedbackRevisionRequest: {
        pending: true, note, requestedBy: req.staff._id, requestedAt: new Date(),
        sourceFeedbackVersion: order.decisionReferral.archive?.referralFeedbackVersion || null,
      } } }, { new: true });
    if (!referral) fail('已发出补充请求或专科转介状态已变化');
    res.json({ success: true, data: referral, message: '已请专科补充反馈，顾问审核任务继续保留' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : '补充请求失败' });
  }
});

router.post('/tasks/:id/advance', staffAuth, async (req, res) => {
  try {
    const task = await FollowUp.findById(req.params.id);
    if (!task || task.sourceType !== 'order' || !task.sourceOrderId) fail('服务任务不存在', 404);
    const order = await Order.findById(task.sourceOrderId);
    if (!isDecisionOrder(order)) fail('此任务不属于企业家健康决策计划', 404);
    if (!activeOrder(order)) fail('订单已取消、退款或完成，不能继续办理');
    const patient = await User.findById(order.user).select('tenantId assignedFamilyDoctor assignedHealthManager assignedHealthPlanner').lean();
    if (!patient || id(task.patientId) !== id(patient)) fail('任务与客户不匹配', 403);
    if (id(patient.tenantId) !== id(req.staff.tenantId)) fail('无权办理此服务', 403);
    const stage = stageOf(task) || (task.workflowKey ? '' : 'intake');
    if (!stage) fail('任务不属于本服务岗位流程', 409);
    const assignee = stage === 'intake' ? (order.supervisorId || patient.assignedHealthPlanner)
      : stage === 'booking' ? patient.assignedHealthManager
        : stage === 'specialist' ? order.decisionReferral?.plan?.specialistStaffId
          : stage === 'planner_final' ? (order.supervisorId || patient.assignedHealthPlanner) : patient.assignedFamilyDoctor;
    if (req.staff.role !== 'superadmin' && (req.staff.role !== roles[stage] || id(req.staff) !== id(assignee) || id(task.assignedTo || task.staffId) !== id(req.staff))) fail('当前环节不属于此账号', 403);
    if (stage === 'specialist') fail('请在收到的原转介中提交报告解析回复', 409);
    if (stage !== current(order)) {
      const completed = (order.decisionReferral?.history || []).find(row => row.stage === stage);
      if (completed && stage !== 'intake') {
        await FollowUp.updateOne({ _id: task._id, status: { $in: ['planned', 'in_progress', 'missed'] } },
          { $set: { status: 'completed', completedAt: completed.at || new Date(), completedBy: 'staff', executedContent: completed.detail || '' } });
        return res.json({ success: true, data: order, message: '本环节此前已流转，任务状态已同步' });
      }
      fail(stage === 'intake' ? '规划师督办任务保留至最终验收，请查看当前服务进度' : '任务已流转，请刷新');
    }
    if (!['planned', 'in_progress', 'missed'].includes(task.status)) fail('任务已办理，请刷新');
    const body = req.body || {};
    const now = new Date();
    const state = order.decisionReferral || { stage: 'intake' };
    let detail = '';
    if (stage === 'intake') {
      detail = clean(body.intakeNote, 1000);
      if (!detail) fail('请记录客户需求及转交顾问的要点', 400);
      await ensureTask(order, patient, 'advisor', patient.assignedFamilyDoctor);
    } else if (stage === 'advisor') {
      const expectedAt = serviceDate(body.expectedAt);
      const method = clean(body.method, 30);
      const reason = clean(body.reason, 1000);
      const questionList = clean(body.questionList, 5000);
      const reportIds = Array.isArray(body.reportIds) ? [...new Set(body.reportIds.map(id))].slice(0, 10) : [];
      if (!mongoose.isValidObjectId(body.medicalExpertId) || !Number.isFinite(expectedAt.getTime()) || !['remote', 'outpatient', 'other'].includes(method) || !reason || !questionList || !reportIds.length)
        fail('请完整填写专家、预计解析时间、方式、转介原因、待解答问题并选择本次报告', 400);
      if (reportIds.some(value => !mongoose.isValidObjectId(value))) fail('报告选择无效', 400);
      const reports = await MedicalReport.find({ _id: { $in: reportIds }, user: patient._id })
        .select('_id title checkDate date fileUrl fileUrls ossKey ossKeys').lean();
      if (reports.length !== reportIds.length) fail('所选报告不属于本客户或已不存在', 400);
      if (reports.some(report => !report.fileUrl && !report.fileUrls?.length))
        fail('所选报告缺少可供专科查看的原件，请先补充报告文件', 400);
      const expert = await MedicalExpert.findOne({ _id: body.medicalExpertId, status: 'active' })
        .populate('institutionId', 'name').populate('departmentId', 'name campus').lean();
      if (!expert) fail('所选专家不可用');
      if (!expert.linkedStaffId) fail('该专家未关联医护账号，无法由专科本人在线回复转介；请先关联账号');
      const specialist = await Admin.findOne({ _id: expert.linkedStaffId, role: 'specialist', staffStatus: { $ne: 'inactive' } }).select('tenantId').lean();
      if (!specialist || id(specialist.tenantId) !== id(patient.tenantId)) fail('所选专家未关联本机构有效的专科医生账号');
      const advisorPlan = {
        hospital: expert.institutionId?.name || '', campus: expert.campus || expert.departmentId?.campus || '',
        department: expert.departmentId?.name || '', expert: expert.name, medicalExpertId: expert._id,
        specialistStaffId: expert.linkedStaffId,
        expectedAt, method, reason, questionList, confirmedBy: req.staff._id, confirmedAt: now,
      };
      if (!advisorPlan.hospital || !advisorPlan.department) fail('专家资源缺少医院或科室');
      const referralId = new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`decision-referral:${order._id}:referral`).digest('hex').slice(0, 24));
      const referral = await Referral.findOneAndUpdate({ _id: referralId }, { $setOnInsert: {
        sourceOrderId: order._id, patientId: patient._id, fromStaffId: req.staff._id,
        toStaffId: expert.linkedStaffId, referralType: 'external_medical', medicalExpertId: expert._id,
        medicalExpertSnapshot: { name: expert.name, title: expert.title, institutionName: advisorPlan.hospital,
          departmentName: advisorPlan.department, campus: advisorPlan.campus, capturedAt: now },
        referralPurpose: '体检报告解读', reason, questionList, content: clean(body.content, 5000),
        sourceReports: reports.map(report => ({ reportId: report._id, title: report.title,
          checkDate: report.checkDate || report.date || null })),
        status: 'pending', requiresConclusion: true,
      } }, { upsert: true, new: true });
      if (id(referral.medicalExpertId) !== id(expert) || referral.reason !== reason || referral.questionList !== questionList)
        fail('本订单已有不同内容的转介，请刷新核对');
      await ensureTask(order, patient, 'booking', patient.assignedHealthManager);
      await ensureTask(order, patient, 'specialist', expert.linkedStaffId);
      state.plan = advisorPlan;
      state.referralId = referralId;
      detail = `已确认${advisorPlan.hospital} · ${advisorPlan.department} · ${advisorPlan.expert}，并发起专科转介`;
    } else if (stage === 'booking') {
      const actualAt = serviceDate(body.actualAt);
      const contactNote = clean(body.contactNote, 2000);
      const appointmentNote = clean(body.appointmentNote, 2000);
      if (!Number.isFinite(actualAt.getTime()) || !contactNote || !appointmentNote)
        fail('请填写实际预约时间、预约结果和客户沟通记录', 400);
      const referral = await Referral.findById(state.referralId).select('status').lean();
      if (!referral || referral.status === 'rejected')
        fail('专科已退回本次转介，请健康顾问先修订并重新发送');
      state.booking = { actualAt, appointmentNote, contactNote, confirmedBy: req.staff._id, confirmedAt: now };
      detail = `已预约${actualAt.toISOString()}；客户沟通：${contactNote}`;
    } else if (stage === 'advisor_review') {
      const referral = await Referral.findById(state.referralId);
      if (!referral || referral.status !== 'completed' || !referral.respondedAt || !(referral.responseOpinion || referral.responseAnalysis || referral.response))
        fail('专科尚未在原转介中提交完整解析反馈');
      if (referral.courseDraftStatus === 'pending_review')
        fail('转介病程草稿仍待顾问审核，请先在转介记录中核对并归档');
      if (referral.feedbackRevisionRequest?.pending)
        fail('已请求专科补充解析，请等待对方重新提交反馈');
      const archiveNote = clean(body.archiveNote, 3000);
      if (!archiveNote) fail('请填写顾问审核和归档结论', 400);
      await ensureTask(order, patient, 'planner_final', order.supervisorId || patient.assignedHealthPlanner);
      state.archive = { note: archiveNote, referralFeedbackVersion: referral.feedbackVersion || 0,
        reviewedBy: req.staff._id, reviewedAt: now };
      detail = archiveNote;
    } else if (stage === 'planner_final') {
      const acceptanceNote = clean(body.acceptanceNote, 2000);
      if (!acceptanceNote || !state.archive?.reviewedAt || !state.booking?.confirmedAt)
        fail('请核对预约、专科回复和顾问归档，并填写最终验收结论', 400);
      const referral = await Referral.findById(state.referralId).select('status feedbackVersion').lean();
      if (referral?.status !== 'completed' || (referral.feedbackVersion || 0) !== state.archive.referralFeedbackVersion)
        fail('专科回复已变化，请健康顾问重新核对后再验收');
      if (Number(order.totalUnits || 1) !== 1 || order.serviceItemsSnapshot?.length)
        fail('本流程仅适用于单次服务，请核对订单规格');
      state.specialistRespondedAt = referral.respondedAt || now;
      state.acceptance = { note: acceptanceNote, confirmedBy: req.staff._id, confirmedAt: now };
      detail = acceptanceNote;
    }
    state.stage = next[stage];
    state.history = [...(state.history || []), { stage, staffId: req.staff._id, staffName: req.staff.name || '', at: now, detail }].slice(-30);
    const update = {
      decisionReferral: state, currentStage: next[stage], currentAssignee: ({
        intake: patient.assignedFamilyDoctor, advisor: patient.assignedHealthManager, booking: state.plan?.specialistStaffId || null,
        advisor_review: order.supervisorId || patient.assignedHealthPlanner, planner_final: null,
      })[stage],
      ...(stage === 'intake' ? { status: 'scheduled', scheduledAt: now, supervisionStatus: 'in_progress' } : {}),
      ...(stage === 'planner_final' ? { status: 'completed', tradeStatus: 'completed', fulfillmentStatus: 'completed',
        completedAt: now, usedUnits: Math.max(1, order.usedUnits || 0), supervisionStatus: 'completed',
        serviceStartedAt: order.serviceStartedAt || state.specialistRespondedAt || now,
        serviceStartedBy: order.serviceStartedBy || req.staff._id,
        serviceStartEvidence: order.serviceStartEvidence || '已完成专科报告解析、顾问审核归档及规划师验收' } : {}),
    };
    const filter = { _id: order._id, status: { $in: ['pending', 'scheduled'] },
      tradeStatus: { $in: ['paid', 'fulfilling', 'partially_refunded'] },
      refundStatus: { $in: ['', 'none', 'failed', 'partially_refunded', null] },
      ...(order.decisionReferral?.stage
      ? { 'decisionReferral.stage': stage } : { $or: [{ decisionReferral: null }, { decisionReferral: { $exists: false } }] }) };
    const saved = await Order.findOneAndUpdate(filter, {
      $set: update,
      ...(stage === 'planner_final' && Number(order.usedUnits || 0) < 1
        ? { $push: { redemptions: { sequence: 1, redeemedAt: now, redeemedBy: req.staff._id, note: detail } } } : {}),
    }, { new: true });
    if (!saved) fail('订单状态已变化，请刷新');
    await FollowUp.updateOne({ _id: task._id, status: { $in: ['planned', 'in_progress', 'missed'] } },
      { $set: stage === 'intake'
        ? { status: 'in_progress', executedContent: detail }
        : { status: 'completed', completedAt: now, completedBy: 'staff', executedContent: detail } });
    if (stage === 'booking') await ensureAdvisorReview(saved);
    if (stage === 'booking') await FollowUp.updateOne({ _id: taskId(order._id, 'specialist'),
      status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { isBlocked: false, date: now, remindAt: now } });
    if (stage === 'planner_final') {
      await FollowUp.updateMany({ sourceType: 'order', sourceOrderId: order._id,
        status: { $in: ['planned', 'in_progress', 'missed'] } },
      { $set: { status: 'completed', completedAt: now, completedBy: 'staff' } });
      try {
        await Fulfillment.updateOne({ order: order._id }, { $set: { status: 'completed', completedAt: now } });
        await require('../utils/commissionSettlement').settleOrderCommission(saved);
        if (saved.packageEntitlementUsage)
          await require('../utils/packageServiceRedemption').safeReconcilePackageOrder(saved);
      } catch (error) {
        console.error('[decision-referral] 服务已归档，结算待补偿', id(order), error);
      }
    }
    res.json({ success: true, data: saved, message: stage === 'planner_final' ? '服务已验收归档，工作台任务结束' : '本环节已完成并流转' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : '服务流转失败，请刷新后重试' });
  }
});

module.exports = { router, isDecisionOrder, onReferralFeedback, validateFeedbackWindow, stageOf };
