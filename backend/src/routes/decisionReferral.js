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
const taskId = (orderId, stage, index = 0) => new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`decision-referral:${orderId}:${stage}${index ? `:${index}` : ''}`).digest('hex').slice(0, 24));
const referralIds = state => state?.referralIds?.length ? state.referralIds : state?.referralId ? [state.referralId] : [];
const specialties = state => state?.plan?.specialties?.length ? state.plan.specialties : state?.plan ? [state.plan] : [];
const archivedVersion = (state, referralId) => state?.archive?.referralFeedbackVersions?.find(row => id(row.referralId) === id(referralId))?.feedbackVersion
  ?? (id(referralIds(state)[0]) === id(referralId) ? state?.archive?.referralFeedbackVersion : undefined);
const referralTaskIndex = task => Number(String(task.workflowKey || '').split(':')[2] || 0);
const referralObjectId = (orderId, index) => new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`decision-referral:${orderId}:referral${index ? `:${index}` : ''}`).digest('hex').slice(0, 24));
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

async function ensureTask(order, patient, stage, assignee, index = 0) {
  if (!assignee) fail(`客户尚未分配${({ advisor: '健康顾问', booking: '健管专员', specialist: '专科医生', advisor_review: '健康顾问', planner_final: '健康规划师' })[stage]}`);
  const now = new Date();
  return FollowUp.findOneAndUpdate(
    { _id: taskId(order._id, stage, index) },
    { $setOnInsert: {
      patientId: patient._id, tenantId: patient.tenantId || null, sourceType: 'order', sourceOrderId: order._id,
      staffId: assignee, assignedTo: assignee, taskRole: 'executor', workflowKey: `decision_referral:${stage}${index ? `:${index}` : ''}`,
      type: 'other', status: 'planned', date: now, remindAt: now, theme: labels[stage],
      plannedContent: labels[stage], content: labels[stage], isBlocked: stage === 'specialist',
      coordinationGroupId: `decision-referral:${order._id}`,
    } },
    { upsert: true, new: true },
  );
}

async function ensureAdvisorReview(order) {
  if (current(order) !== 'specialist' || !order.decisionReferral?.booking?.confirmedAt) return;
  const referrals = await Promise.all(referralIds(order.decisionReferral).map(referralId => Referral.findById(referralId).lean()));
  if (!referrals.length || referrals.some(referral => referral?.status !== 'completed')) return;
  const patient = await User.findById(order.user).select('tenantId assignedFamilyDoctor').lean();
  if (!patient) fail('客户档案不存在');
  await ensureTask(order, patient, 'advisor_review', patient.assignedFamilyDoctor);
  await Order.updateOne({ _id: order._id, 'decisionReferral.stage': 'specialist' },
    { $set: { 'decisionReferral.stage': 'advisor_review', currentStage: 'advisor_review', currentAssignee: patient.assignedFamilyDoctor } });
}

async function onReferralFeedback(referral) {
  if (!referral.sourceOrderId || referral.status !== 'completed') return;
  const order = await Order.findById(referral.sourceOrderId);
  if (!isDecisionOrder(order) || !activeOrder(order)) return;
  const index = referralIds(order.decisionReferral).findIndex(value => id(value) === id(referral));
  if (index < 0) return;
  if (current(order) === 'planner_final'
    && (referral.feedbackVersion || 0) !== archivedVersion(order.decisionReferral, referral._id)) {
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
  await FollowUp.updateOne({ _id: taskId(order._id, 'specialist', index), status: { $in: ['planned', 'in_progress', 'missed'] } },
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
  if (!referralIds(order.decisionReferral).some(value => id(value) === id(referral))) fail('转介与原订单不匹配');
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
      order.supervisorId, ...specialties(order.decisionReferral).map(row => row.specialistStaffId)];
    if (req.staff.role !== 'superadmin' && !team.some(value => id(value) === id(req.staff))) fail('无权查看此服务', 403);
    const referrals = await Promise.all(referralIds(order.decisionReferral).map(referralId => Referral.findById(referralId)
      .select('status response responseAnalysis responseOpinion respondedAt feedbackVersion medicalExpertSnapshot courseDraftStatus feedbackRevisionRequest').lean()));
    const referral = referrals[0] || null;
    res.json({ success: true, data: { orderId: order._id, stage: current(order), workflow: order.decisionReferral || null,
      referral, referrals, taskStatus: task.status, taskStage: stageOf(task) || (task.workflowKey ? '' : 'intake') } });
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
    const targetId = req.body?.referralId || referralIds(order.decisionReferral)[0];
    if (!referralIds(order.decisionReferral).some(value => id(value) === id(targetId))) fail('请选择本服务中的专科转介', 400);
    const referral = await Referral.findOneAndUpdate({ _id: targetId, status: 'completed',
      'feedbackRevisionRequest.pending': { $ne: true } }, { $set: { feedbackRevisionRequest: {
        pending: true, note, requestedBy: req.staff._id, requestedAt: new Date(),
        sourceFeedbackVersion: archivedVersion(order.decisionReferral, targetId) ?? null,
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
        : stage === 'specialist' ? specialties(order.decisionReferral)[referralTaskIndex(task)]?.specialistStaffId
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
      const reason = clean(body.reason, 1000);
      const questionList = clean(body.questionList, 5000);
      const reportIds = Array.isArray(body.reportIds) ? [...new Set(body.reportIds.map(id))].slice(0, 10) : [];
      const consultationType = body.consultationType || 'single';
      const requests = Array.isArray(body.specialties) ? body.specialties : [{ medicalExpertId: body.medicalExpertId, expectedAt: body.expectedAt, method: body.method }];
      if (!['single', 'multidisciplinary'].includes(consultationType)
        || requests.length < (consultationType === 'single' ? 1 : 2)
        || requests.length > (consultationType === 'single' ? 1 : 5))
        fail('请选择单学科或多学科会诊；多学科需安排 2 至 5 位专家', 400);
      if (!reason || !questionList || !reportIds.length) fail('请填写转介原因、待解答问题并选择本次报告', 400);
      if (new Set(requests.map(row => id(row.medicalExpertId))).size !== requests.length)
        fail('同一位专家不能重复安排，请选择不同专科专家', 400);
      if (reportIds.some(value => !mongoose.isValidObjectId(value))) fail('报告选择无效', 400);
      const reports = await MedicalReport.find({ _id: { $in: reportIds }, user: patient._id })
        .select('_id title checkDate date fileUrl fileUrls ossKey ossKeys').lean();
      if (reports.length !== reportIds.length) fail('所选报告不属于本客户或已不存在', 400);
      if (reports.some(report => !report.fileUrl && !report.fileUrls?.length))
        fail('所选报告缺少可供专科查看的原件，请先补充报告文件', 400);
      const plans = [];
      const ids = [];
      for (const [index, request] of requests.entries()) {
        const expectedAt = serviceDate(request.expectedAt);
        const method = clean(request.method, 30);
        if (!mongoose.isValidObjectId(request.medicalExpertId) || !Number.isFinite(expectedAt.getTime())
          || !['remote', 'outpatient', 'other'].includes(method))
          fail(`第 ${index + 1} 位专家缺少有效的专家、预计解析时间或方式`, 400);
        const expert = await MedicalExpert.findOne({ _id: request.medicalExpertId, status: 'active' })
          .populate('institutionId', 'name').populate('departmentId', 'name campus').lean();
        if (!expert) fail(`第 ${index + 1} 位专家不可用`);
        if (!expert.linkedStaffId) fail(`第 ${index + 1} 位专家未关联医护账号，无法在线回复转介`);
        const specialist = await Admin.findOne({ _id: expert.linkedStaffId, role: 'specialist', staffStatus: { $ne: 'inactive' } }).select('tenantId').lean();
        if (!specialist || id(specialist.tenantId) !== id(patient.tenantId)) fail(`第 ${index + 1} 位专家未关联本机构有效的专科医生账号`);
        const plan = { hospital: expert.institutionId?.name || '', campus: clean(request.campus, 120) || expert.campus || expert.departmentId?.campus || '',
          department: expert.departmentId?.name || '', expert: expert.name, medicalExpertId: expert._id,
          specialistStaffId: expert.linkedStaffId, expectedAt, method,
          focusQuestion: clean(request.focusQuestion, 2000) };
        if (!plan.hospital || !plan.department || !plan.campus) fail(`第 ${index + 1} 位专家资源缺少医院、院区或科室`);
        plans.push(plan);
      }
      await ensureTask(order, patient, 'booking', patient.assignedHealthManager);
      for (const [index, plan] of plans.entries()) {
        const referralId = referralObjectId(order._id, index);
        const referral = await Referral.findOneAndUpdate({ _id: referralId }, { $setOnInsert: {
          sourceOrderId: order._id, patientId: patient._id, fromStaffId: req.staff._id,
          toStaffId: plan.specialistStaffId, referralType: 'external_medical', medicalExpertId: plan.medicalExpertId,
          medicalExpertSnapshot: { name: plan.expert, institutionName: plan.hospital,
            departmentName: plan.department, campus: plan.campus, capturedAt: now },
          referralPurpose: '体检报告解读', reason, questionList: plan.focusQuestion || questionList, content: clean(body.content, 5000),
          sourceReports: reports.map(report => ({ reportId: report._id, title: report.title,
            checkDate: report.checkDate || report.date || null })),
          status: 'pending', requiresConclusion: true,
        } }, { upsert: true, new: true });
        if (id(referral.medicalExpertId) !== id(plan.medicalExpertId) || referral.reason !== reason
          || referral.questionList !== (plan.focusQuestion || questionList)) fail('本订单已有不同内容的转介，请刷新核对');
        await ensureTask(order, patient, 'specialist', plan.specialistStaffId, index);
        ids.push(referralId);
      }
      state.plan = { ...plans[0], consultationType, specialties: plans, reason, questionList,
        confirmedBy: req.staff._id, confirmedAt: now };
      state.referralId = ids[0];
      state.referralIds = ids;
      detail = `已确认${consultationType === 'single' ? '单学科' : '多学科'}会诊（${plans.map(plan => `${plan.department}·${plan.expert}`).join('、')}），并发起 ${ids.length} 份专科转介`;
    } else if (stage === 'booking') {
      const contactNote = clean(body.contactNote, 2000);
      const requests = Array.isArray(body.bookings) ? body.bookings : [{ actualAt: body.actualAt, appointmentNote: body.appointmentNote }];
      if (!contactNote || requests.length !== referralIds(state).length) fail('请填写每位专家的预约安排及客户沟通记录', 400);
      const slots = [];
      for (const [index, request] of requests.entries()) {
        const actualAt = serviceDate(request.actualAt);
        const appointmentNote = clean(request.appointmentNote, 2000);
        if (!Number.isFinite(actualAt.getTime()) || !appointmentNote) fail(`请填写第 ${index + 1} 位专家的实际预约时间和结果`, 400);
        const referral = await Referral.findById(referralIds(state)[index]).select('status').lean();
        if (!referral || referral.status === 'rejected') fail(`第 ${index + 1} 份专科转介已退回，请健康顾问先处理`);
        slots.push({ referralId: referralIds(state)[index], actualAt, appointmentNote });
      }
      state.booking = { ...slots[0], slots, contactNote, confirmedBy: req.staff._id, confirmedAt: now };
      detail = `已预约 ${slots.length} 位专家；客户沟通：${contactNote}`;
    } else if (stage === 'advisor_review') {
      const referrals = await Promise.all(referralIds(state).map(referralId => Referral.findById(referralId)));
      for (const [index, referral] of referrals.entries()) {
        if (!referral || referral.status !== 'completed' || !referral.respondedAt || !(referral.responseOpinion || referral.responseAnalysis || referral.response))
          fail(`第 ${index + 1} 位专科尚未在原转介中提交完整解析反馈`);
        if (referral.courseDraftStatus === 'pending_review') fail(`第 ${index + 1} 份转介病程草稿仍待顾问审核`);
        if (referral.feedbackRevisionRequest?.pending) fail(`第 ${index + 1} 位专科补充解析尚未提交`);
      }
      const archiveNote = clean(body.archiveNote, 3000);
      if (!archiveNote) fail('请填写顾问审核和归档结论', 400);
      await ensureTask(order, patient, 'planner_final', order.supervisorId || patient.assignedHealthPlanner);
      state.archive = { note: archiveNote, referralFeedbackVersion: referrals[0].feedbackVersion || 0,
        referralFeedbackVersions: referrals.map(referral => ({ referralId: referral._id, feedbackVersion: referral.feedbackVersion || 0 })),
        reviewedBy: req.staff._id, reviewedAt: now };
      detail = archiveNote;
    } else if (stage === 'planner_final') {
      const acceptanceNote = clean(body.acceptanceNote, 2000);
      if (!acceptanceNote || !state.archive?.reviewedAt || !state.booking?.confirmedAt)
        fail('请核对预约、专科回复和顾问归档，并填写最终验收结论', 400);
      const referrals = await Promise.all(referralIds(state).map(referralId => Referral.findById(referralId).select('status feedbackVersion respondedAt').lean()));
      if (!referrals.length || referrals.some((referral, index) => referral?.status !== 'completed'
        || (referral.feedbackVersion || 0) !== archivedVersion(state, referralIds(state)[index])))
        fail('专科回复已变化，请健康顾问重新核对后再验收');
      if (Number(order.totalUnits || 1) !== 1 || order.serviceItemsSnapshot?.length)
        fail('本流程仅适用于单次服务，请核对订单规格');
      state.specialistRespondedAt = referrals.reduce((latest, referral) => referral.respondedAt && referral.respondedAt > latest ? referral.respondedAt : latest, new Date(0)) || now;
      state.acceptance = { note: acceptanceNote, confirmedBy: req.staff._id, confirmedAt: now };
      detail = acceptanceNote;
    }
    state.stage = next[stage];
    state.history = [...(state.history || []), { stage, staffId: req.staff._id, staffName: req.staff.name || '', at: now, detail }].slice(-30);
    const update = {
      decisionReferral: state, currentStage: next[stage], currentAssignee: ({
        intake: patient.assignedFamilyDoctor, advisor: patient.assignedHealthManager, booking: specialties(state)[0]?.specialistStaffId || null,
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
        ? { status: 'in_progress', taskRole: 'supervisor', executedContent: detail }
        : { status: 'completed', completedAt: now, completedBy: 'staff', executedContent: detail } });
    if (stage === 'booking') await ensureAdvisorReview(saved);
    if (stage === 'booking') for (const index of referralIds(state).keys()) await FollowUp.updateOne({ _id: taskId(order._id, 'specialist', index),
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
