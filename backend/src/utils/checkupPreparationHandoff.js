const { assertPreparationOwner } = require('./annualCheckupEvidence');
const idOf = value => String(value?._id || value || '');
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const time = value => value ? new Date(value).getTime() : NaN;

async function requireHandoffIndex(Handoff) {
  let indexes;
  try { indexes = await Handoff.collection.indexes(); }
  catch { throw fail('服务承接唯一索引尚未就绪，请管理员核对部署条件'); }
  if (!indexes.some(index => index.unique && index.key?.servicePlanId === 1 && Object.keys(index.key).length === 1 && !index.partialFilterExpression)) {
    throw fail('服务承接唯一索引尚未就绪，请管理员核对部署条件');
  }
}

function createHandoffService(models, readinessFor) {
  const { FollowUp, AnnualPlan, HealthPlan, Order, Handoff } = models;
  async function context(taskId, actor, writing = false) {
    const task = await FollowUp.findById(taskId).lean();
    const role = assertPreparationOwner(task, actor);
    if (writing && role !== 'healthPlanner') throw fail('仅本任务健康规划师可关联服务', 403);
    const readiness = await readinessFor(taskId, actor);
    const fresh = await FollowUp.findById(taskId).lean();
    assertPreparationOwner(fresh, actor);
    if (idOf(fresh.patientId) !== idOf(task.patientId) || idOf(fresh.sourceAnnualPlanId) !== idOf(task.sourceAnnualPlanId)
      || fresh.sourceScheduleKey !== task.sourceScheduleKey) throw fail('准备来源已变化，请刷新');
    return { task, readiness };
  }
  async function target(service, task, readiness, ownedTaskIds = []) {
    if (!service || idOf(service.patientId) !== idOf(task.patientId) || service.type !== 'medical_assist'
      || service.content?.serviceDomain !== 'annual_checkup' || !['draft', 'active'].includes(service.status)
      || service.content.workflowCompletedAt || service.supervisionStatus === 'cancelled'
      || service.content.serviceDate !== readiness.targetDate || !Number.isFinite(time(service.updatedAt))) return '服务客户、类型、日期或状态不匹配';
    if (models.customerIntakeError) {
      const intakeError = await models.customerIntakeError(service);
      if (intakeError) return intakeError;
    }
    const annual = await AnnualPlan.findById(task.sourceAnnualPlanId).lean();
    if (!annual?.confirmedAt || !(time(service.createdAt) >= time(annual.confirmedAt))) return '不能沿用本年度确认前的旧服务';
    if (service.sourceOrderId) {
      const order = await Order.findOne({ _id: service.sourceOrderId, user: task.patientId, orderType: 'service',
        ...require('./orderWorkItem').activeOrderWorkItemQuery() }).lean();
      if (!order) return '服务订单未支付、失效或已结束';
    } else if (service.initiationSource !== 'staff' || !service.initiatedByStaff) return '服务缺少有效订单或员工发起凭据';
    if (await FollowUp.exists({ sourceHealthPlanId: service._id, sourceType: 'health_plan', workflowKey: { $ne: 'service:intake' },
      ...(ownedTaskIds.length ? { _id: { $nin: ownedTaskIds } } : {}), status: { $in: ['in_progress', 'completed'] } })) return '服务已有执行记录，不得重新承接';
    if (await HealthPlan.exists({ patientId: task.patientId, type: 'annual_checkup', _id: { $ne: readiness.plan?.id },
      'content.serviceInstanceId': { $in: [service._id, idOf(service._id)] } })) return '服务已被其他体检方案使用';
    const claimed = await Handoff.findOne({ servicePlanId: service._id }).lean();
    if (claimed && idOf(claimed._id) !== readiness.plan?.id) return '服务已由其他准备方案关联';
    return '';
  }
  async function options(taskId, actor) {
    const { task, readiness } = await context(taskId, actor);
    const link = await Handoff.findOne({ plannerTaskId: task._id }).lean();
    if (!readiness.readyForServiceLink || link) return { readiness, link, services: [] };
    const services = [];
    const rows = await HealthPlan.find({ patientId: task.patientId, type: 'medical_assist', status: { $in: ['draft', 'active'] },
      'content.serviceDomain': 'annual_checkup', 'content.serviceDate': readiness.targetDate }).sort({ createdAt: -1 }).limit(100).lean();
    for (const row of rows) if (!(await target(row, task, readiness))) services.push({ _id: row._id, title: row.title, updatedAt: row.updatedAt, date: row.content.serviceDate });
    return { readiness, link: null, services };
  }
  async function link(taskId, actor, request) {
    const { task, readiness } = await context(taskId, actor, true);
    if (!models.isValidId(request.servicePlanId)) throw fail('请选择有效体检服务', 400);
    const existing = await Handoff.findOne({ plannerTaskId: task._id }).lean();
    if (existing) {
      if (idOf(existing.servicePlanId) !== request.servicePlanId) throw fail('已关联服务不可直接替换，请核对原记录');
      return existing;
    }
    if (!readiness.readyForServiceLink || !readiness.plan?.id) throw fail('准备条件未齐备，请刷新核对');
    const service = await HealthPlan.findById(request.servicePlanId).lean();
    const reason = await target(service, task, readiness);
    if (reason) throw fail(reason);
    if (!request.updatedAt || time(request.updatedAt) !== time(service.updatedAt)) throw fail('服务已变化，请刷新后重新选择');
    await requireHandoffIndex(Handoff);
    const payload = { _id: readiness.plan.id, servicePlanId: service._id, patientId: task.patientId, annualPlanId: task.sourceAnnualPlanId,
      plannerTaskId: task._id, linkedBy: actor._id, status: 'linked_pending_activation', evidence: readiness,
      serviceTitle: service.title || '', serviceUpdatedAt: service.updatedAt };
    try {
      await Handoff.updateOne({ _id: payload._id }, { $setOnInsert: payload }, { upsert: true, runValidators: true });
    } catch (error) {
      if (error.code !== 11000 || (!error.keyPattern?._id && !error.keyPattern?.servicePlanId)) throw error;
      throw fail('该方案或服务已被关联，请刷新查看');
    }
    const saved = await Handoff.findById(payload._id).lean();
    if (!saved || idOf(saved.servicePlanId) !== idOf(service._id) || idOf(saved.plannerTaskId) !== idOf(task._id)) throw fail('关联已变化，请刷新');
    // Intentionally no legacy flow invocation. Activation must revalidate the
    // exact service and evidence and recover partial task writes separately.
    return saved;
  }
  return { options, link, target };
}
module.exports = { createHandoffService, requireHandoffIndex };
