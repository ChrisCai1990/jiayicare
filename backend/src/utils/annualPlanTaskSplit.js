const Task = require('../models/Task');
const User = require('../models/User');
const { syncAnnualPlanFollowUps } = require('./annualPlanFollowUps');
const { syncAnnualPlanServiceTasks } = require('./annualPlanServiceTasks');

const addDays = (date, days) => new Date(new Date(date).getTime() + days * 86400000);

function buildAnnualPlanKickoffTasks(plan, patient, confirmedAt = plan.confirmedAt || new Date()) {
  const label = `${plan.year || new Date(confirmedAt).getFullYear()}年度健康管理方案`;
  return {
    client: {
      key: 'client_plan_execution', title: `开始执行${label}`,
      description: '查看已确认方案及本人任务，按计划完成健康记录、检查或服务事项；具体日期以任务列表为准。',
      dueDate: addDays(confirmedAt, 7).toISOString().slice(0, 10),
    },
    staff: [],
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
  if (plan.continuitySource?.previousPlanId) plan = { ...(gate.executionPlan || (plan.toObject ? plan.toObject() : plan)), confirmedAt: gate.anchor };
  try {
  const patient = await User.findById(plan.patientId)
    .select('assignedHealthManager assignedHealthPlanner').lean();
  const rows = buildAnnualPlanKickoffTasks(plan, patient);
  // 仅派发具体服务与随访；历史年度统筹记录保留，不再更新或删除。
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
  const staffTasks = 0;
  // 必须等待所有子写入结束才释放同步状态；Promise.all的提前拒绝会让旧写入穿过改期事务。
  const settled = await Promise.allSettled([
    syncAnnualPlanFollowUps(plan), syncAnnualPlanServiceTasks(plan), require('./annualCheckupDispatch').runtime().sync(plan),
  ]);
  const rejected = settled.find(result => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  const [scheduledFollowUps, serviceTasks] = settled.map(result => result.value);
  if (plan.continuitySource?.previousPlanId && gate.period?.activationStatus !== 'active') {
    await require('./annualPlanSupplyPlans').syncAnnualPlanSupplyPlans(plan);
    await require('./annualPlanTreatmentSync').syncAnnualPlanTreatments(plan);
  }
  const warnings = [];
  if (!patient?.assignedHealthPlanner) warnings.push('客户尚未绑定健康规划师，请完善服务任务责任岗位');
  if (gate.period && !patient?.assignedHealthManager) warnings.push('客户尚未绑定健管专员，请完善随访责任岗位');
  warnings.push(...(serviceTasks.warnings || []));
  if (gate.period) await tracker.finishRenewalSync(gate.period, attemptId, { issue: warnings.length ? { code: 'assignment', role: 'healthPlanner', message: warnings.join('；') } : null });
  return { clientTasks: clientResult.upsertedCount || 0, staffTasks, scheduledFollowUps, serviceTasks, warnings };
  } catch (error) {
    if (gate.period) await tracker.finishRenewalSync(gate.period, attemptId, { issue: { code: 'sync_failed', role: error.code === 'ANNUAL_SCHEDULE_CONFLICT' ? 'familyDoctor' : 'healthPlanner', message: error.code === 'ANNUAL_SCHEDULE_CONFLICT' ? error.message : error.code === 'ANNUAL_DISPATCH_INDEX_REQUIRED' ? '年度派发唯一索引尚未就绪，请联系管理员核对后重试' : '年度任务同步未完成，系统将每日重试；可在工作台核对后重新同步' } }).catch(() => {});
    throw error;
  }
}

module.exports = { buildAnnualPlanKickoffTasks, syncAnnualPlanTaskSplit };
