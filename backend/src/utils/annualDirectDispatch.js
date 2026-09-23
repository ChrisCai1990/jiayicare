const crypto = require('crypto');
const tools = require('../../../shared/annualDispatch.cjs');
const booking = require('../../../shared/annualBookingPlan.cjs');
const fail = (message, statusCode = 409) => { throw Object.assign(new Error(message), { statusCode }); };
function owner(task, actor, role) {
  if (actor.role !== 'superadmin' && (actor.role !== role || String(task.assignedTo) !== String(actor._id))) fail('该任务未分配给当前岗位人员', 403);
}
function runtime(models = {}) {
  const FollowUp = models.FollowUp || require('../models/FollowUp'), Admin = models.Admin || require('../models/Admin');
  const enabled = models.enabled || require('./healthManagementRollout').enabledForPatient;
  async function load(id, actor) {
    let task = await FollowUp.findById(id).lean();
    if (!task || !tools.dedicated(task)) fail('未找到就医协助任务', 404);
    owner(task, actor, tools.isExecution(task) ? 'medicalAssistant' : 'healthPlanner');
    if (!enabled(task.patientId)) fail('该客户未开放新版派单', 403);
    const execution = tools.isExecution(task) ? task : null;
    if (execution) {
      task = await FollowUp.findById(execution.sourceId).lean();
      if (!task || String(task.patientId) !== String(execution.patientId) || String(task.annualDispatch?.executionId) !== String(execution._id)) fail('派单来源不一致');
    }
    const parent = task.annualDispatch ? await FollowUp.findById(task.annualDispatch.followUpId).lean() : null;
    return { task, execution, parent };
  }
  async function context(id, actor) {
    const c = await load(id, actor);
    if (!c.parent) {
      const key = require('../../../shared/annualServiceItem.cjs').followUpKey(c.task);
      const rows = key ? await FollowUp.find({ patientId: c.task.patientId, sourceAnnualPlanId: c.task.sourceAnnualPlanId, sourceType: 'scheduled', sourceScheduleKey: key, deliveryMode: { $in: ['single', 'managed'] }, status: { $nin: ['cancelled'] } }).lean() : [];
      if (rows.length === 1) c.parent = rows[0];
      else c.warning = '未找到唯一对应的顾问事项，请核对原计划，不能任意选择其他随访';
    }
    if (c.parent && String(c.parent.patientId) !== String(c.task.patientId)) fail('顾问事项归属不一致');
    const assistants = !c.execution ? await Admin.find({ role: 'medicalAssistant', staffStatus: 'active', tenantId: actor.tenantId || null }).select('name role').lean() : [];
    const child = c.execution || (c.task.annualDispatch ? await FollowUp.findById(c.task.annualDispatch.executionId).lean() : null);
    return { ...c, child, assistants };
  }
  async function dispatch(id, actor, body) {
    const c = await context(id, actor), { task, parent } = c;
    if (c.execution) fail('执行人员不能派单', 403);
    if (task.serviceTracking?.linkId || parent?.serviceTracking?.linkId) fail('本事项已有服务承接，不能重复派单');
    if (['cancelled', 'completed'].includes(task.status)) fail('本事项已结束');
    if (task.status === 'in_progress' && !task.annualDispatch) fail('本事项已由原服务流程启动，请在原服务中继续办理');
    if (!parent || !booking.bookingReady(parent.annualBooking)) fail('请先由健管专员确认预约安排');
    if (!task.annualDispatch && !['planned', 'in_progress', 'missed'].includes(parent.status)) fail('原顾问事项已结束，不能新建派单');
    if (task.formData?.serviceRequest?.mode === 'managed') fail('全托管服务需沿用一站式流程，不能改成单项代办');
    if (!c.assistants.some(a => String(a._id) === body.assigneeId)) fail('请选择本机构有效的就医专员', 400);
    if (typeof body.note !== 'string' || body.note.length > 2000) fail('派单备注不能超过2000字', 400);
    let intent = task.annualDispatch;
    if (intent && (String(intent.assigneeId) !== body.assigneeId || intent.note !== body.note.trim())) fail('已派单，不可重复改派；请核对已留存的交接');
    if (!intent) {
      const executionId = crypto.createHash('sha256').update(`annual-assistance:${task._id}`).digest('hex').slice(0, 24);
      intent = { status: 'active', executionId, followUpId: parent._id, assigneeId: body.assigneeId,
        assigneeName: c.assistants.find(a => String(a._id) === body.assigneeId).name,
        note: body.note.trim(), by: actor._id, at: new Date(), bookingSnapshot: parent.annualBooking,
        advisorPlanText: parent.plannedContent || parent.content, itemSnapshot: task.formData?.serviceRequest?.itemSnapshot || {} };
      const saved = await FollowUp.updateOne({ _id: task._id, updatedAt: task.updatedAt, annualDispatch: null, 'serviceTracking.linkId': null, status: { $in: ['planned', 'missed'] } }, { $set: { annualDispatch: intent, status: 'in_progress' } });
      if (!saved.modifiedCount) fail('任务已更新，请刷新核对');
    }
    // Durable intent precedes deterministic child upsert: interruption is retryable,
    // and concurrent retries cannot create a second execution task.
    const dates = (intent.bookingSnapshot.entries || [intent.bookingSnapshot]).filter(e => e.status === 'booked' && e.date).map(e => `${e.date}T${e.time || '00:00'}:00+08:00`).sort();
    await FollowUp.updateOne({ _id: intent.executionId }, { $setOnInsert: {
      patientId: task.patientId, staffId: actor._id, assignedTo: intent.assigneeId, taskRole: 'executor',
      sourceType: 'annual_service', sourceId: task._id, sourceAnnualPlanId: task.sourceAnnualPlanId,
      sourceScheduleKey: `dispatch-execute:${task._id}`, workflowKey: 'assistance_execute',
      coordinationGroupId: `annual-assistance:${task._id}`, status: 'planned', aiStatus: 'approved',
      date: dates[0] ? new Date(dates[0]) : task.date, remindAt: new Date(),
      theme: `就医协助办理 · ${intent.itemSnapshot.items || intent.itemSnapshot.name || '顾问指定事项'}`,
      plannedContent: intent.advisorPlanText, content: intent.advisorPlanText,
      formData: { annualDispatchRequestId: String(task._id) }, deliveryMode: 'single', deliveryType: task.deliveryType || '',
    } }, { upsert: true });
    return context(id, actor);
  }
  async function submit(id, actor, body) {
    const c = await context(id, actor);
    if (!c.execution) fail('仅就医专员执行任务可提交', 403);
    if (c.task.annualDispatch.status !== 'active' || c.execution.status === 'cancelled') fail('任务已提交或结束，请刷新');
    if (booking.pendingOnsite(c.parent?.annualBooking).length) fail('请先登记现场预约结果');
    if (typeof body.result !== 'string' || !body.result.trim() || body.result.length > 5000 || body.confirmed !== true) fail('请核对所有办理事项并填写执行结果', 400);
    const result = { text: body.result.trim(), by: actor._id, at: new Date(), confirmed: true };
    const saved = await FollowUp.updateOne({ _id: c.task._id, 'annualDispatch.status': 'active', updatedAt: c.task.updatedAt }, { $set: { 'annualDispatch.status': 'pending_review', 'annualDispatch.result': result } });
    if (!saved.modifiedCount) fail('任务已更新，请刷新');
    return context(id, actor);
  }
  async function review(id, actor, body) {
    const c = await context(id, actor);
    if (c.execution) fail('仅健康规划师可验收', 403);
    if (!['pending_review', 'completed'].includes(c.task.annualDispatch?.status)) fail('尚未提交执行结果');
    if (body.confirmed !== true) fail('请确认办理结果', 400);
    if (booking.pendingOnsite(c.parent?.annualBooking).length) fail('现场预约结果尚未齐全');
    if (c.task.annualDispatch.status !== 'completed') {
      const saved = await FollowUp.updateOne({ _id: c.task._id, updatedAt: c.task.updatedAt, 'annualDispatch.status': 'pending_review' }, { $set: { 'annualDispatch.status': 'completed', 'annualDispatch.review': { by: actor._id, at: new Date() }, status: 'completed', completedAt: new Date() } });
      if (!saved.modifiedCount) fail('任务已变化，请刷新');
    }
    await FollowUp.updateOne({ _id: c.task.annualDispatch.executionId, sourceId: c.task._id, status: { $in: ['planned', 'in_progress'] } }, { $set: { status: 'completed', completedAt: c.task.annualDispatch.review?.at || new Date(), executedContent: c.task.annualDispatch.result.text } });
    // The original clinical follow-up deliberately stays open for advisor outcome review.
    return context(id, actor);
  }
  return { context, dispatch, submit, review };
}
module.exports = { runtime };
