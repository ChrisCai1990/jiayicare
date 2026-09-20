const { randomUUID } = require('crypto');
const { assertPreparationOwner } = require('./annualCheckupEvidence');
const { requireHandoffIndex } = require('./checkupPreparationHandoff');
const idOf = value => String(value?._id || value || '');
const fail = message => Object.assign(new Error(message), { statusCode: 409 });
const owned = (task, link, step) => idOf(task?.checkupPreparationActivation?.linkId) === idOf(link._id)
  && task.checkupPreparationActivation.step === step && idOf(task.patientId) === idOf(link.patientId)
  && idOf(task.sourceHealthPlanId) === idOf(link.servicePlanId) && task.sourceType === 'health_plan' && task.taskRole === 'executor';

function createActivationService(models, readinessFor, validateTarget) {
  const { FollowUp, FollowUpPlan, HealthPlan, User, Handoff } = models;
  async function reconcileIntake(link, actor) {
    const rows = (await FollowUp.find({ sourceHealthPlanId: link.servicePlanId, patientId: link.patientId,
      sourceType: 'health_plan', workflowKey: 'service:intake', taskRole: 'supervisor' }).lean())
      .filter(row => row.workflowKey === 'service:intake' && row.sourceType === 'health_plan'
        && row.taskRole === 'supervisor' && idOf(row.patientId) === idOf(link.patientId)
        && idOf(row.sourceHealthPlanId) === idOf(link.servicePlanId));
    if (!rows.length) return;
    if (rows.length !== 1) throw fail('服务收单任务重复，请核对后再承接');
    const intake = rows[0];
    if (intake.status === 'completed') return; // Preserve existing human evidence.
    const [design, booking, patient] = await Promise.all([
      FollowUp.findById(link.activation?.designTaskId).lean(),
      FollowUp.findById(link.activation?.bookingTaskId).lean(),
      User.findById(link.patientId).lean(),
    ]);
    if (!owned(design, link, 'design') || design.status !== 'completed'
      || !owned(booking, link, 'booking') || !['in_progress', 'completed'].includes(booking.status)
      || !link.activation?.evidence?.readyForServiceLink
      || idOf(link.activation.evidence.plan?.id) !== idOf(link._id)
      || idOf(intake.assignedTo) !== idOf(actor._id) || idOf(patient?.assignedHealthPlanner) !== idOf(actor._id)
      || !['planned', 'missed'].includes(intake.status)) throw fail('服务收单已变化或承接凭据不完整，请核对');
    const result = await FollowUp.updateOne({ _id: intake._id, updatedAt: intake.updatedAt, status: intake.status,
      assignedTo: intake.assignedTo, sourceHealthPlanId: link.servicePlanId, workflowKey: 'service:intake' }, {
      $set: { status: 'completed', isBlocked: false, completedAt: new Date(), completedBy: 'staff',
        executedContent: '复用规划师已完成的年度准备及本次服务承接核验，不重复收单',
        'formData.checkupPreparationIntake': { linkId: link._id, plannerTaskId: link.plannerTaskId,
          designTaskId: design._id, bookingTaskId: booking._id, by: actor._id, at: new Date() } },
    });
    if (!result.matchedCount) throw fail('服务收单并发变化，请刷新重试');
  }
  async function load(taskId, actor) {
    const task = await FollowUp.findById(taskId).lean();
    if (assertPreparationOwner(task, actor) !== 'healthPlanner') throw Object.assign(fail('仅本准备任务健康规划师可推进预约'), { statusCode: 403 });
    const link = await Handoff.findOne({ plannerTaskId: task._id }).lean();
    if (!link || idOf(link.patientId) !== idOf(task.patientId) || idOf(link.annualPlanId) !== idOf(task.sourceAnnualPlanId)) throw fail('本次服务关联不存在或来源不符');
    return { task, link };
  }
  async function activate(taskId, actor) {
    const { task, link } = await load(taskId, actor);
    if (link.status === 'active') { await reconcileIntake(link, actor); return link; }
    if (link.status === 'activating') throw fail('预约承接正在处理；中断时须管理员核实恢复，不可重复抢占');
    if (!['linked_pending_activation', 'activation_failed'].includes(link.status)) throw fail('承接状态不允许启动');
    await requireHandoffIndex(Handoff);
    const token = randomUUID();
    const claim = await Handoff.updateOne({ _id: link._id, status: link.status,
      ...(link.activation ? { 'activation.token': link.activation.token } : { activation: null }) }, {
      $set: { status: 'activating', activation: { ...(link.activation || {}), token, actorId: actor._id, startedAt: new Date(), message: '' } },
      $push: { activationHistory: { event: 'activation_started', token, previousToken: link.activation?.token || null, by: actor._id, at: new Date() } },
    });
    if (!claim.matchedCount) throw fail('已有其他承接请求，请刷新');
    const guard = { _id: link._id, status: 'activating', 'activation.token': token };
    try {
      const previousDesign = link.activation?.designTaskId ? await FollowUp.findById(link.activation.designTaskId).lean() : null;
      const previousBooking = link.activation?.bookingTaskId ? await FollowUp.findById(link.activation.bookingTaskId).lean() : null;
      // A lost final acknowledgement is reconciled from same-document task proof,
      // without reopening/resetting booking or later execution stages.
      if (!(owned(previousDesign, link, 'design') && owned(previousBooking, link, 'booking')
        && previousDesign.status === 'completed' && ['in_progress', 'completed'].includes(previousBooking.status))) {
        const readiness = await readinessFor(taskId, actor);
        if (!readiness.readyForServiceLink || readiness.plan?.id !== idOf(link._id)) throw fail('准备条件或客户确认已变化，请核对');
        const service = await HealthPlan.findById(link.servicePlanId).lean();
        if (service?.status !== 'active' || !service.pushedAt || ['pending', 'rejected'].includes(service.content?.aiStatus)) throw fail('原体检服务尚未有效审核发布，请先按原流程办理');
        const ownedIds = [previousDesign, previousBooking].filter(row => row && owned(row, link, row.checkupPreparationActivation?.step)).map(row => row._id);
        const reason = await validateTarget(service, task, readiness, ownedIds);
        if (reason) throw fail(reason);
        const patient = await User.findById(task.patientId).lean();
        const ids = (service.content.followUpPlans?.length ? service.content.followUpPlans.map(row => row.id || row._id) : [service.content.followUpPlanId]).filter(Boolean);
        const schemes = await FollowUpPlan.find({ _id: { $in: ids }, status: 'active', reviewStatus: { $ne: 'pending_review' } }).lean();
        const stages = require('./checkupOneStopFlow').stageForScheme;
        const rows = await FollowUp.find({ sourceHealthPlanId: service._id, sourceType: 'health_plan', patientId: task.patientId, taskRole: 'executor' }).lean();
        function select(stage, assignee) {
          const matching = schemes.filter(scheme => stages(scheme) === stage);
          if (matching.length !== 1 || matching[0].executorRole !== (stage === 'plan_design' ? 'familyDoctor' : 'healthPlanner')) throw fail('原体检流程缺少唯一且岗位正确的方案/预约节点，请完善原服务流程');
          const candidates = rows.filter(row => idOf(row.followUpSchemeId) === idOf(matching[0]._id) && row.workflowKey === idOf(matching[0]._id));
          if (candidates.length !== 1 || !assignee || idOf(candidates[0].assignedTo) !== idOf(assignee)) throw fail('原服务任务缺失、重复或负责人不符，不能另建任务绕过');
          return candidates[0];
        }
        const design = select('plan_design', patient?.assignedFamilyDoctor);
        const booking = select('booking', patient?.assignedHealthPlanner);
        if (idOf(booking.dependsOnTaskId) !== idOf(design._id)) throw fail('原预约前置关系不符，请核对流程');
        if (design.dependsOnTaskId) {
          const parent = await FollowUp.findById(design.dependsOnTaskId).lean();
          if (parent?.status !== 'completed' || idOf(parent.sourceHealthPlanId) !== idOf(service._id)) throw fail('原服务收单/前置任务尚未完成');
        }
        function validateStep(row, step) {
          if (owned(row, link, step)) {
            if (step === 'design' ? row.status === 'completed' : ['in_progress', 'completed'].includes(row.status)) return;
            throw fail('已承接任务状态被改变，请人工核对');
          }
          if (!['planned', 'missed'].includes(row.status) || row.checkupPreparationActivation || (step === 'booking' && !row.isBlocked)) throw fail('任务已执行或被其他流程修改');
        }
        validateStep(design, 'design'); validateStep(booking, 'booking');
        const saved = await Handoff.updateOne(guard, { $set: { 'activation.designTaskId': design._id, 'activation.bookingTaskId': booking._id, 'activation.evidence': readiness } });
        if (!saved.matchedCount) throw fail('承接状态已变化');
        async function apply(row, step, patch) {
          if (!(await Handoff.exists(guard))) throw fail('承接运行状态已变化，请刷新');
          if (owned(row, link, step)) return;
          const result = await FollowUp.updateOne({ _id: row._id, updatedAt: row.updatedAt, status: row.status, assignedTo: row.assignedTo,
            sourceHealthPlanId: service._id, dependsOnTaskId: row.dependsOnTaskId || null, isBlocked: row.isBlocked, checkupPreparationActivation: null }, {
            $set: { ...patch, checkupPreparationActivation: { linkId: link._id, step, by: actor._id, at: new Date() } },
          }, { runValidators: true });
          if (!result.matchedCount) throw fail('原服务任务并发变化，请刷新核对');
        }
        await apply(design, 'design', { status: 'completed', isBlocked: false, completedAt: new Date(), completedBy: 'staff',
          executedContent: '年度准备体检方案已审核发布并经客户确认，复用准备结果，不重复定制', activationEvent: '' });
        // Recheck external evidence immediately before the side effect visible
        // to booking staff. This is not a cross-collection transaction lock.
        const currentReadiness = await readinessFor(taskId, actor);
        const currentService = await HealthPlan.findById(link.servicePlanId).lean();
        if (!currentReadiness.readyForServiceLink || currentReadiness.plan?.id !== idOf(link._id)
          || currentService?.status !== 'active' || !currentService.pushedAt || ['pending', 'rejected'].includes(currentService.content?.aiStatus)) throw fail('准备或服务状态已变化，预约尚未解锁');
        const currentReason = await validateTarget(currentService, task, currentReadiness, [design._id, ...ownedIds.filter(id => idOf(id) !== idOf(design._id))]);
        if (currentReason) throw fail(currentReason);
        await apply(booking, 'booking', { status: 'in_progress', isBlocked: false, activationEvent: '', date: new Date(), remindAt: new Date() });
      }
      if (!(await Handoff.exists(guard))) throw fail('承接运行状态已变化，请刷新');
      await reconcileIntake(await Handoff.findById(link._id).lean(), actor);
      const done = await Handoff.updateOne(guard, { $set: { status: 'active', 'activation.finishedAt': new Date() },
        $push: { activationHistory: { event: 'booking_activated', token, at: new Date() } } });
      if (!done.matchedCount) throw fail('任务已推进，承接记录需刷新核对');
      return Handoff.findById(link._id).lean();
    } catch (error) {
      await Handoff.updateOne(guard, { $set: { status: 'activation_failed', 'activation.message': '预约承接未全部完成，请核对准备条件及原服务任务后重试；已完成步骤不重复执行' } });
      throw error;
    }
  }
  async function recover(taskId, actor, request) {
    if (actor.role !== 'superadmin') throw Object.assign(fail('仅管理员可恢复中断承接'), { statusCode: 403 });
    if (typeof request.token !== 'string' || !request.token || request.processStopped !== true || typeof request.reason !== 'string' || !request.reason.trim() || request.reason.length > 500) throw fail('须确认旧请求已停止并填写原因');
    const { link } = await load(taskId, actor);
    const result = await Handoff.updateOne({ _id: link._id, status: 'activating', 'activation.token': request.token }, {
      $set: { status: 'activation_failed', 'activation.message': '管理员确认中断，可重新核验并继续' },
      $push: { activationHistory: { event: 'recovered', by: actor._id, at: new Date(), token: request.token, reason: request.reason.trim() } },
    });
    if (!result.matchedCount) throw fail('承接状态已变化');
    return Handoff.findById(link._id).lean();
  }
  return { activate, recover };
}
module.exports = { createActivationService };
