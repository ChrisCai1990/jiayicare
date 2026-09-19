const Task = require('../models/Task');
const FollowUp = require('../models/FollowUp');
const User = require('../models/User');
const { syncAnnualPlanFollowUps } = require('./annualPlanFollowUps');
const { syncAnnualPlanServiceTasks } = require('./annualPlanServiceTasks');

const addDays = (date, days) => new Date(new Date(date).getTime() + days * 86400000);

function buildAnnualPlanKickoffTasks(plan, patient, confirmedAt = plan.confirmedAt || new Date()) {
  const label = `${plan.year || new Date(confirmedAt).getFullYear()}年度健康管理方案`;
  const staffRows = [
    patient?.assignedHealthPlanner && {
      key: 'health_planner_coordination', assignedTo: patient.assignedHealthPlanner, date: addDays(confirmedAt, 3),
      theme: `统筹${label}协同任务`,
      content: '核对各责任角色、关键节点和待协调事项；只处理本人工作台中的协同任务，并持续关注整体进度与阻塞。',
    },
  ].filter(Boolean);
  return {
    client: {
      key: 'client_plan_execution', title: `开始执行${label}`,
      description: '查看已确认方案及本人任务，按计划完成健康记录、检查或服务事项；具体日期以任务列表为准。',
      dueDate: addDays(confirmedAt, 7).toISOString().slice(0, 10),
    },
    staff: staffRows,
  };
}

async function syncAnnualPlanTaskSplit(plan) {
  if (!plan.confirmedAt) return { clientTasks: 0, staffTasks: 0, scheduledFollowUps: 0, warnings: ['客户尚未确认方案'] };
  const gate = await require('./annualServicePeriod').annualExecutionGate(plan);
  const tracker = require('./annualRenewalSyncState');
  const attemptId = gate.period ? await tracker.beginRenewalSync(gate.period) : null;
  if (!gate.allowed) {
    if (gate.period) await tracker.finishRenewalSync(gate.period, attemptId, { allowed: false, issue: gate.issue });
    return { clientTasks: 0, staffTasks: 0, scheduledFollowUps: 0, warnings: [gate.reason] };
  }
  if (plan.continuitySource?.previousPlanId) plan = { ...(plan.toObject ? plan.toObject() : plan), confirmedAt: gate.anchor };
  try {
  const patient = await User.findById(plan.patientId)
    .select('assignedHealthManager assignedHealthPlanner').lean();
  const rows = buildAnnualPlanKickoffTasks(plan, patient);
  // 健管专员不再接收“制定/启动随访计划”的二次任务；客户确认后，方案内
  // 已明确的常规管理事项由 syncAnnualPlanFollowUps 直接生成到负责人工作台。
  await FollowUp.deleteMany({
    sourceAnnualPlanId: plan._id,
    sourceType: 'annual_coordination',
    sourceScheduleKey: 'health_manager_kickoff',
    status: { $ne: 'completed' },
  });
  const clientPayload = { user: plan.patientId, title: rows.client.title, description: rows.client.description,
    category: 'annual_management', type: 'followup', priority: 'medium', dueDate: rows.client.dueDate, assignee: '客户', status: 'pending',
    sourceAnnualPlanId: plan._id, sourceTaskKey: rows.client.key };
  const clientResult = plan.continuitySource?.previousPlanId
    ? await require('./annualDispatchOnce').insertAnnualOnce(Task, plan, 'client', rows.client.key,
      { sourceAnnualPlanId: plan._id, sourceTaskKey: rows.client.key }, clientPayload)
    : await Task.updateOne(
    { sourceAnnualPlanId: plan._id, sourceTaskKey: rows.client.key },
    { $set: {
      user: plan.patientId, title: rows.client.title, description: rows.client.description,
      category: 'annual_management', type: 'followup', priority: 'medium', dueDate: rows.client.dueDate,
      assignee: '客户',
    }, $setOnInsert: { status: 'pending', sourceAnnualPlanId: plan._id, sourceTaskKey: rows.client.key } },
    { upsert: true },
  );
  let staffTasks = 0;
  for (const row of rows.staff) {
    const key = { sourceAnnualPlanId: plan._id, sourceType: 'annual_coordination', sourceScheduleKey: row.key };
    const payload = {
        patientId: plan.patientId, staffId: plan.createdBy || row.assignedTo, assignedTo: row.assignedTo,
        date: row.date, theme: row.theme, content: row.content, plannedContent: row.content,
    };
    // 开放任务可更新负责人，但不重置进行中/逾期状态；已完成、已取消的记录完全保留。
    await FollowUp.updateOne({ ...key, status: { $in: ['planned', 'in_progress', 'missed'] } }, { $set: payload });
    const result = plan.continuitySource?.previousPlanId
      ? await require('./annualDispatchOnce').insertAnnualOnce(FollowUp, plan, 'coordination', row.key, key, { ...key, ...payload, status: 'planned', aiStatus: 'approved', reviewRole: null })
      : await FollowUp.updateOne(key, {
      $setOnInsert: { ...key, ...payload, status: 'planned', aiStatus: 'approved', reviewRole: null },
    }, { upsert: true });
    if (result.upsertedCount) staffTasks++;
  }
  const [scheduledFollowUps, serviceTasks] = await Promise.all([
    syncAnnualPlanFollowUps(plan), syncAnnualPlanServiceTasks(plan),
  ]);
  if (plan.continuitySource?.previousPlanId && gate.period?.activationStatus !== 'active') {
    await require('./annualPlanSupplyPlans').syncAnnualPlanSupplyPlans(plan);
    await require('./annualPlanTreatmentSync').syncAnnualPlanTreatments(plan);
  }
  const warnings = [];
  if (!patient?.assignedHealthPlanner) warnings.push('客户尚未绑定健康规划师，未生成规划师协同待办');
  if (gate.period && !patient?.assignedHealthManager) warnings.push('客户尚未绑定健管专员，请完善随访责任岗位');
  warnings.push(...(serviceTasks.warnings || []));
  if (gate.period) await tracker.finishRenewalSync(gate.period, attemptId, { issue: warnings.length ? { code: 'assignment', role: 'healthPlanner', message: warnings.join('；') } : null });
  return { clientTasks: clientResult.upsertedCount || 0, staffTasks, scheduledFollowUps, serviceTasks, warnings };
  } catch (error) {
    if (gate.period) await tracker.finishRenewalSync(gate.period, attemptId, { issue: { code: 'sync_failed', role: 'healthPlanner', message: error.code === 'ANNUAL_DISPATCH_INDEX_REQUIRED' ? '年度派发唯一索引尚未就绪，请联系管理员核对后重试' : '年度任务同步未完成，系统将每日重试；可在工作台核对后重新同步' } }).catch(() => {});
    throw error;
  }
}

module.exports = { buildAnnualPlanKickoffTasks, syncAnnualPlanTaskSplit };
