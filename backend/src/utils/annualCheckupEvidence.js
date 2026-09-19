// 处理已经存在的体检准备任务；不负责派发，不创建/启动体检服务。
const { dayOf } = require('./serviceAccess');
const idOf = value => String(value?._id || value || '');
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const OPEN = ['planned', 'in_progress', 'missed'];

function preparationRole(task) {
  const data = task?.formData?.annualCheckupPreparation;
  const role = data?.role;
  return task?.sourceType === 'annual_service' && task.sourceAnnualPlanId && data?.version === 1
    && ['familyDoctor', 'healthPlanner'].includes(role)
    && task.workflowKey === `annual_checkup_preparation:${role}`
    && new RegExp(`^annual_checkup:\\d{4}-\\d{2}-\\d{2}:prepare:${role}$`).test(task.sourceScheduleKey || '') ? role : '';
}

function assertPreparationOwner(task, actor) {
  const role = preparationRole(task);
  if (!role) throw fail('体检准备任务不存在', 404);
  if (actor?.role !== 'superadmin' && (actor?.role !== role || idOf(actor._id) !== idOf(task.assignedTo))) {
    throw fail('仅本任务负责岗位可办理体检准备', 403);
  }
  return role;
}

function eligibleCheckupPlan(plan, task, annual) {
  return Boolean(plan && annual?.confirmedAt && plan.type === 'annual_checkup'
    && (!plan.preparationTaskId || (idOf(plan.preparationTaskId) === idOf(task._id) && idOf(plan.content?.annualPlanId) === idOf(annual._id)))
    && idOf(plan.patientId) === idOf(task.patientId) && ['draft', 'active'].includes(plan.status)
    && Number.isFinite(new Date(plan.createdAt).getTime())
    && new Date(plan.createdAt) >= new Date(annual.confirmedAt));
}

function checkupPlanReady(plan, task, annual) {
  return eligibleCheckupPlan(plan, task, annual) && plan.status === 'active' && Boolean(plan.pushedAt)
    && plan.content?.aiStatus === 'approved'
    && Boolean((plan.content.reviewedBy && plan.content.reviewedAt) || (plan.content.aiApprovedBy && plan.content.aiApprovedAt));
}

function plannerEvidence(input, task, now = new Date()) {
  const date = typeof input.date === 'string' ? input.date : '';
  const institution = typeof input.institution === 'string' ? input.institution.trim() : '';
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || dayOf(date) !== date || date !== task.formData.annualCheckupPreparation.targetDate) {
    throw fail('准备日期须与当前体检日期一致；如需改期，请先由健康顾问核对排期', 400);
  }
  if (date < dayOf(now)) throw fail('体检日期已过，请先核对完成情况或调整安排', 400);
  if (!institution || institution.length > 200 || !note || note.length > 2000 || input.customerConfirmed !== true || input.resourceConfirmed !== true) {
    throw fail('请记录体检机构、客户时间及机构资源的实际沟通结果（说明不超过2000字）', 400);
  }
  return { date, institution, note, customerConfirmed: true, resourceConfirmed: true };
}

function taskVersionFilter(task) {
  if (!task.updatedAt || !Number.isFinite(new Date(task.updatedAt).getTime())) throw fail('任务缺少有效版本，请联系管理员核对');
  return { _id: task._id, sourceType: 'annual_service', workflowKey: task.workflowKey,
    updatedAt: task.updatedAt, status: task.status, assignedTo: task.assignedTo, 'serviceTracking.linkId': null,
    isBlocked: task.isBlocked || { $in: [false, null] }, 'formData.annualCheckupPreparation': task.formData.annualCheckupPreparation };
}

async function savePreparationEvidence(task, annual, input, actor, models, now = new Date()) {
  const role = assertPreparationOwner(task, actor);
  if (!annual || idOf(annual._id) !== idOf(task.sourceAnnualPlanId) || idOf(annual.patientId) !== idOf(task.patientId)
    || !annual.confirmedAt || !annual.pushedAt || annual.reviewStatus !== 'approved') throw fail('年度方案来源无效，请核对');
  if (!OPEN.includes(task.status) || task.isBlocked || task.serviceTracking?.linkId) throw fail('准备任务已结束或被锁定，请刷新');
  if (!input.updatedAt || new Date(input.updatedAt).getTime() !== new Date(task.updatedAt).getTime()) throw fail('任务已更新，请刷新后再保存');
  let evidence; let ready = false;
  if (role === 'familyDoctor') {
    if (!models.isValidId(input.healthPlanId)) throw fail('请选择本次体检方案', 400);
    const plan = await models.HealthPlan.findById(input.healthPlanId).lean();
    if (!eligibleCheckupPlan(plan, task, annual)) throw fail('须选择本客户、本年度确认后建立且未取消的体检方案', 400);
    evidence = { healthPlanId: idOf(plan._id), title: plan.title || '', selectedBy: actor._id, selectedAt: now };
    ready = checkupPlanReady(plan, task, annual);
    if (ready) evidence.review = { by: plan.content.reviewedBy || plan.content.aiApprovedBy, at: plan.content.reviewedAt || plan.content.aiApprovedAt, publishedAt: plan.pushedAt };
  } else {
    evidence = { ...plannerEvidence(input, task, now), recordedBy: actor._id, recordedAt: now };
    ready = true;
  }
  const result = await models.FollowUp.updateOne(taskVersionFilter(task), { $set: {
    'formData.annualCheckupPreparation.evidence': evidence,
    status: ready ? 'completed' : 'in_progress',
    completedAt: ready ? now : null, completedBy: ready ? 'staff' : null,
    executedContent: role === 'familyDoctor' ? `已关联本次体检方案：${evidence.title}${ready ? '（已审核发布）' : '（等待原方案审核发布）'}`
      : `体检时间：${evidence.date}；机构：${evidence.institution}；沟通结果：${evidence.note}`,
  }, $push: { 'formData.annualCheckupPreparation.history': {
    at: now, by: actor._id, event: role === 'familyDoctor' ? 'plan_selected' : 'resources_recorded', evidence,
  } } });
  if (!result.matchedCount) throw fail('任务已更新，请刷新；本次未覆盖已有记录');
  return { ready };
}

async function reconcileCheckupPreparation(filter = {}, providedModels) {
  const models = providedModels || { FollowUp: require('../models/FollowUp'), HealthPlan: require('../models/HealthPlan'), AnnualPlan: require('../models/AnnualPlan') };
  const rows = await models.FollowUp.find({ $and: [filter, { sourceType: 'annual_service', workflowKey: 'annual_checkup_preparation:familyDoctor',
    status: { $in: OPEN }, 'formData.annualCheckupPreparation.evidence.healthPlanId': { $exists: true } }] }).lean();
  let completed = 0;
  const errors = [];
  for (const task of rows) {
    try {
      if (preparationRole(task) !== 'familyDoctor' || task.isBlocked || task.serviceTracking?.linkId) continue;
      const meta = task.formData.annualCheckupPreparation;
      const [plan, annual] = await Promise.all([
        models.HealthPlan.findById(meta.evidence.healthPlanId).lean(),
        models.AnnualPlan.findById(task.sourceAnnualPlanId).lean(),
      ]);
      if (!annual || idOf(annual._id) !== idOf(task.sourceAnnualPlanId) || idOf(annual.patientId) !== idOf(task.patientId)
        || annual.reviewStatus !== 'approved' || !annual.pushedAt || !checkupPlanReady(plan, task, annual)) continue;
      const result = await models.FollowUp.updateOne(taskVersionFilter(task), { $set: {
        status: 'completed', completedBy: 'staff', completedAt: new Date(),
        'formData.annualCheckupPreparation.evidence.review': {
          by: plan.content.reviewedBy || plan.content.aiApprovedBy, at: plan.content.reviewedAt || plan.content.aiApprovedAt, publishedAt: plan.pushedAt,
        }, executedContent: `本次体检方案已审核发布：${plan.title || ''}`,
      } });
      completed += result.modifiedCount || 0;
    } catch (error) { errors.push(error); } // 单条异常不阻断其他客户的回写；扫描结束仍报告失败供重试。
  }
  if (errors.length) throw errors[0];
  return completed;
}

async function safeReconcileCheckupPreparation(filter) {
  try { return await reconcileCheckupPreparation(filter); }
  catch (error) { console.error('[annual-checkup-preparation] 准备结果同步待重试', error.message); return 0; }
}

module.exports = { preparationRole, assertPreparationOwner, eligibleCheckupPlan, checkupPlanReady, plannerEvidence,
  savePreparationEvidence, reconcileCheckupPreparation, safeReconcileCheckupPreparation };
