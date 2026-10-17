const FollowUp = require('../models/FollowUp');
const HealthPlan = require('../models/HealthPlan');
const Order = require('../models/Order');
const User = require('../models/User');
const CareFlow = require('../models/CareFlow');

const KEY = 'medical_assist:closure';
const active = ['planned', 'in_progress', 'missed'];
const id = value => String(value?._id || value || '');
const reconciliationAt = new Map();

async function requestOrderClosure(orderOrId, note = '') {
  const order = orderOrId?._id ? orderOrId : await Order.findById(orderOrId);
  if (!order || ['cancelled', 'completed'].includes(order.status)) throw Object.assign(new Error('就医协助订单已取消或已结案'), { status: 409 });
  const patient = await User.findById(order.user).select('assignedHealthPlanner tenantId').lean();
  const plannerId = order.supervisorId || patient?.assignedHealthPlanner;
  if (!plannerId) throw Object.assign(new Error('客户尚未分配健康规划师，不能提交结案'), { status: 409 });
  if (await FollowUp.exists({ sourceType: 'order', sourceOrderId: order._id, taskRole: 'executor', status: { $in: active } }))
    return { pending: false };
  const linkedPlans = await HealthPlan.find({ sourceOrderId: order._id, type: 'medical_assist', status: 'active' }).select('_id').lean();
  if (linkedPlans.length && await FollowUp.exists({ sourceHealthPlanId: { $in: linkedPlans.map(plan => plan._id) }, taskRole: 'executor', status: { $in: active } }))
    return { pending: false };
  const now = new Date();
  await FollowUp.findOneAndUpdate(
    { sourceType: 'order', sourceOrderId: order._id, workflowKey: KEY },
    { $setOnInsert: { tenantId: order.tenantId || patient?.tenantId || null,
      patientId: order.user, staffId: plannerId, sourceType: 'order', sourceOrderId: order._id,
      workflowKey: KEY, taskRole: 'supervisor', type: 'other', formData: {}, theme: `就医协助：健康规划师确认结案 · ${order.serviceName}` },
    $set: { assignedTo: plannerId, status: 'planned', isBlocked: false, date: now, remindAt: now,
      content: note || '执行环节已完成。请核对服务结果和交付资料后确认结案。', completedAt: null, completedBy: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Order.updateOne({ _id: order._id, status: { $ne: 'cancelled' } }, { $set: {
    supervisorId: plannerId, currentStage: 'pending_closure', currentAssignee: plannerId,
    supervisionStatus: 'pending_closure', closureMode: 'planner_review',
  } });
  await FollowUp.updateMany({ sourceType: 'order', sourceOrderId: order._id, workflowKey: { $in: [
    'medical_proxy:supervise', 'checkup_appointment:supervise', 'medication_proxy:progress',
  ] }, status: { $in: active } }, { $set: {
    'formData.currentStage': 'pending_closure', content: '执行环节已结束，等待健康规划师确认结案。',
  } });
}

async function requestPlanClosure(planOrId, note = '') {
  const plan = planOrId?._id ? planOrId : await HealthPlan.findById(planOrId);
  if (!plan || plan.type !== 'medical_assist' || ['cancelled', 'completed'].includes(plan.status)) throw Object.assign(new Error('就医协助方案已取消或已结案'), { status: 409 });
  const patient = await User.findById(plan.patientId).select('assignedHealthPlanner tenantId').lean();
  const plannerId = plan.supervisorId || patient?.assignedHealthPlanner;
  if (!plannerId) throw Object.assign(new Error('客户尚未分配健康规划师，不能提交结案'), { status: 409 });
  if (await FollowUp.exists({ sourceHealthPlanId: plan._id, taskRole: 'executor', status: { $in: active } }))
    return { pending: false };
  if (plan.sourceOrderId) {
    const order = await Order.findById(plan.sourceOrderId).select('totalUnits status').lean();
    if (Number(order?.totalUnits || 1) <= 1) {
      const queued = await requestOrderClosure(plan.sourceOrderId, note);
      if (queued?.pending === false) return queued;
      await HealthPlan.updateOne({ _id: plan._id, status: 'active' }, { $set: {
        supervisorId: plannerId, currentStage: 'pending_closure', currentAssignee: plannerId,
        supervisionStatus: 'pending_closure', closureMode: 'planner_review',
      } });
      return;
    }
  }
  const now = new Date();
  await FollowUp.findOneAndUpdate(
    { sourceType: 'health_plan', sourceHealthPlanId: plan._id, workflowKey: KEY },
    { $setOnInsert: { tenantId: plan.tenantId || patient?.tenantId || null,
      patientId: plan.patientId, staffId: plannerId, sourceType: 'health_plan', sourceHealthPlanId: plan._id,
      workflowKey: KEY, coordinationGroupId: `medical-assist:${plan._id}`, taskRole: 'supervisor', type: 'other', formData: {}, theme: `就医协助：健康规划师确认结案 · ${plan.title}` },
    $set: { assignedTo: plannerId, status: 'planned', isBlocked: false, date: now, remindAt: now,
      content: note || '执行环节已完成。请核对服务结果和交付资料后确认结案。', completedAt: null, completedBy: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await HealthPlan.updateOne({ _id: plan._id, type: 'medical_assist', status: { $ne: 'cancelled' } }, { $set: {
    status: 'active', supervisorId: plannerId, currentStage: 'pending_closure', currentAssignee: plannerId,
    supervisionStatus: 'pending_closure', closureMode: 'planner_review',
  } });
}

// Reconcile services that reached their final task before the planner gate was introduced.
// Only an open service with completed work and no other active service task is eligible.
async function reconcilePendingClosuresForPlanner(staff) {
  if (staff?.role !== 'healthPlanner') return 0;
  const staffId = id(staff._id);
  if (Date.now() - (reconciliationAt.get(staffId) || 0) < 60000) return 0;
  reconciliationAt.set(staffId, Date.now());
  // A previous failed confirmation may have completed the order before the
  // legacy order cleanup cancelled this still-unconfirmed planner action.
  const interrupted = await FollowUp.find({ assignedTo: staff._id, workflowKey: KEY, status: 'cancelled',
    cancelReason: '关联订单已取消、退款或结束', sourceType: 'order' })
    .select('_id sourceOrderId').limit(50).lean();
  for (const task of interrupted) {
    const order = await Order.findById(task.sourceOrderId).select('status tradeStatus supervisionStatus').lean();
    if (order?.status !== 'completed' || order.tradeStatus !== 'completed' || order.supervisionStatus !== 'completed') continue;
    await FollowUp.updateOne({ _id: task._id, status: 'cancelled',
      cancelReason: '关联订单已取消、退款或结束' }, { $set: { status: 'planned', cancelReason: '', date: new Date(), remindAt: new Date() } });
  }
  const candidates = await FollowUp.find({ assignedTo: staff._id, taskRole: 'supervisor',
    status: { $in: active }, workflowKey: { $ne: KEY }, sourceType: 'order' })
    .select('_id sourceType sourceOrderId sourceHealthPlanId workflowKey formData').limit(100).lean();
  const existing = await FollowUp.find({ assignedTo: staff._id, workflowKey: KEY, status: { $in: active } })
    .select('sourceOrderId sourceHealthPlanId careFlowId').lean();
  const pending = new Set(existing.map(task => id(task.sourceOrderId || task.sourceHealthPlanId || task.careFlowId)));
  let queued = 0;
  const seen = new Set();
  for (const task of candidates) {
    const serviceId = id(task.sourceOrderId || task.sourceHealthPlanId);
    if (!serviceId || seen.has(serviceId) || pending.has(serviceId)) continue;
    seen.add(serviceId);
    if (!['medical_proxy:supervise', 'checkup_appointment:supervise', 'medication_proxy:progress'].includes(task.workflowKey)
      || task.formData?.medicalPlanning === true) continue;
    const order = await Order.findById(task.sourceOrderId).select('status serviceName supervisorId user').lean();
    if (!order || !['pending', 'scheduled'].includes(order.status)) continue;
    const completed = await FollowUp.exists({ sourceType: 'order', sourceOrderId: order._id,
      taskRole: 'executor', status: 'completed' });
    if (!completed) continue;
    const result = await requestOrderClosure(order);
    if (result?.pending !== false) queued++;
  }
  const plans = await HealthPlan.find({ type: 'medical_assist', status: 'active', supervisorId: staff._id })
    .select('_id sourceOrderId patientId title supervisorId').limit(50).lean();
  for (const plan of plans) {
    if (pending.has(id(plan._id)) || (plan.sourceOrderId && pending.has(id(plan.sourceOrderId)))) continue;
    const activeTask = await FollowUp.exists({ sourceHealthPlanId: plan._id,
      taskRole: { $in: ['executor', 'supervisor'] }, status: { $in: active } });
    if (activeTask || !await FollowUp.exists({ sourceHealthPlanId: plan._id, taskRole: 'supervisor', status: 'completed' })) continue;
    const result = await requestPlanClosure(plan);
    if (result?.pending !== false) queued++;
  }
  const flows = await CareFlow.find({ 'state.people.healthPlanner.id': id(staff._id),
    'state.stage': 'closed', 'state.finalized': { $ne: true } }).limit(50).lean();
  for (const flow of flows) {
    if (pending.has(id(flow._id))) continue;
    await require('./careFlowRuntime').runtime().sync(flow);
    queued++;
  }
  return queued;
}

async function confirmClosure(taskId, staff, conclusion) {
  const task = await FollowUp.findOne({ _id: taskId, workflowKey: KEY, status: { $in: active } });
  if (!task) throw Object.assign(new Error('待结案任务不存在或已处理，请刷新'), { status: 409 });
  if (staff.role !== 'healthPlanner') throw Object.assign(new Error('仅健康规划师可确认结案'), { status: 403 });
  if (id(task.assignedTo) !== id(staff._id)) throw Object.assign(new Error('仅本服务的健康规划师可确认结案'), { status: 403 });
  const note = String(conclusion || '').trim();
  if (!note) throw Object.assign(new Error('请填写结案核对结论'), { status: 400 });
  const scope = task.sourceOrderId ? { sourceType: 'order', sourceOrderId: task.sourceOrderId }
    : task.sourceHealthPlanId ? { sourceType: 'health_plan', sourceHealthPlanId: task.sourceHealthPlanId }
      : { careFlowId: task.careFlowId };
  const unfinished = await FollowUp.exists({ ...scope, _id: { $ne: task._id }, taskRole: 'executor', status: { $in: active } });
  if (unfinished) throw Object.assign(new Error('仍有执行环节未结束，请先完成或处理'), { status: 409 });
  let linkedPlans = [];
  if (task.sourceOrderId) {
    const plans = await HealthPlan.find({ sourceOrderId: task.sourceOrderId, type: 'medical_assist', status: 'active' }).select('_id').lean();
    linkedPlans = plans;
    if (plans.length && await FollowUp.exists({ sourceHealthPlanId: { $in: plans.map(plan => plan._id) }, taskRole: 'executor', status: { $in: active } }))
      throw Object.assign(new Error('关联的就医协助方案仍有执行环节未结束'), { status: 409 });
  }
  const now = new Date();
  if (task.sourceOrderId) {
    const changed = await Order.findOneAndUpdate({ _id: task.sourceOrderId, supervisionStatus: 'pending_closure', status: { $nin: ['cancelled', 'completed'] } }, { $set: {
      status: 'completed', tradeStatus: 'completed', fulfillmentStatus: 'completed', completedAt: now,
      currentStage: 'completed', currentAssignee: null, supervisionStatus: 'completed',
    } }, { new: true });
    const order = changed || await Order.findOne({ _id: task.sourceOrderId, supervisionStatus: 'completed', status: 'completed' });
    if (!order) throw Object.assign(new Error('订单状态已变化，请核对'), { status: 409 });
    await require('./medicalProxyWorkflow').settleCompletedMedicalOrder(order, staff._id);
    if (Number(order.totalUnits || 1) <= 1) await Order.updateOne({ _id: order._id, status: 'completed' }, { $max: { usedUnits: 1 } });
    await HealthPlan.updateMany({ sourceOrderId: order._id, type: 'medical_assist', status: 'active' }, { $set: {
      status: 'completed', currentStage: 'completed', currentAssignee: null, supervisionStatus: 'completed',
      'content.workflowCompletedAt': now, 'content.workflowCompletedBy': staff._id,
    } });
  } else if (task.sourceHealthPlanId) {
    const changed = await HealthPlan.findOneAndUpdate({ _id: task.sourceHealthPlanId, type: 'medical_assist', supervisionStatus: 'pending_closure', status: 'active' }, { $set: {
      status: 'completed', currentStage: 'completed', currentAssignee: null, supervisionStatus: 'completed',
      'content.workflowCompletedAt': now, 'content.workflowCompletedBy': staff._id,
    } }, { new: true });
    const plan = changed || await HealthPlan.findOne({ _id: task.sourceHealthPlanId, type: 'medical_assist', supervisionStatus: 'completed', status: 'completed' });
    if (!plan) throw Object.assign(new Error('方案状态已变化，请核对'), { status: 409 });
    if (plan.sourceOrderId) {
      const order = await Order.findOneAndUpdate({ _id: plan.sourceOrderId, totalUnits: { $lte: 1 }, 'specialtyTermsSnapshot.key': { $ne: 'ibd' }, status: { $nin: ['completed', 'cancelled'] } }, { $set: {
        status: 'completed', tradeStatus: 'completed', fulfillmentStatus: 'completed', completedAt: now,
        currentStage: 'completed', currentAssignee: null, supervisionStatus: 'completed', usedUnits: 1,
      } }, { new: true });
      if (order) await require('./medicalProxyWorkflow').settleCompletedMedicalOrder(order, staff._id);
    }
  } else {
    const changed = await CareFlow.findOneAndUpdate({ _id: task.careFlowId, 'state.stage': 'closed', 'state.finalized': { $ne: true } },
      { $set: { 'state.finalized': true } }, { new: true });
    const flow = changed || await CareFlow.findOne({ _id: task.careFlowId, 'state.stage': 'closed', 'state.finalized': true });
    if (!flow) throw Object.assign(new Error('就医协助流程状态已变化，请刷新核对'), { status: 409 });
    await FollowUp.updateOne({ _id: task.careFlowId, careFlowId: task.careFlowId, status: { $in: active } },
      { $set: { status: 'completed', completedAt: now, completedBy: 'staff' } });
  }
  const updated = await FollowUp.updateOne({ _id: task._id, status: { $in: active } }, { $set: {
    status: 'completed', completedAt: now, completedBy: 'staff', executedContent: note,
    formData: { ...(task.formData || {}), closureConfirmedBy: staff._id, closureConfirmedAt: now },
  } });
  if (!updated.modifiedCount) throw Object.assign(new Error('结案已由其他人处理，请刷新'), { status: 409 });
  await FollowUp.updateMany({ ...scope, workflowKey: { $ne: KEY }, taskRole: 'supervisor', status: { $in: active } }, { $set: { status: 'completed', completedAt: now, completedBy: 'staff' } });
  const completedPlans = task.sourceHealthPlanId ? [task.sourceHealthPlanId] : linkedPlans.map(plan => plan._id);
  for (const planId of completedPlans) {
    try { await require('./checkupPreparationCompletion').runtime().forService(planId); }
    catch (error) { console.error('[medical-assist-closure] annual handoff retry needed', id(planId), error.message); }
  }
  return { id: task._id, confirmedAt: now };
}

module.exports = { KEY, requestOrderClosure, requestPlanClosure, reconcilePendingClosuresForPlanner, confirmClosure };
