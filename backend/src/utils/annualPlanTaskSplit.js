const Task = require('../models/Task');
const FollowUp = require('../models/FollowUp');
const User = require('../models/User');
const { syncAnnualPlanFollowUps } = require('./annualPlanFollowUps');

const addDays = (date, days) => new Date(new Date(date).getTime() + days * 86400000);

function buildAnnualPlanKickoffTasks(plan, patient, confirmedAt = plan.confirmedAt || new Date()) {
  const label = `${plan.year || new Date(confirmedAt).getFullYear()}年度健康管理方案`;
  const staffRows = [
    patient?.assignedHealthManager && {
      key: 'health_manager_kickoff', assignedTo: patient.assignedHealthManager, date: addDays(confirmedAt, 1),
      theme: `启动${label}日常跟进`,
      content: '核对客户任务与随访安排，按本人工作台待办逐项跟进；执行结果记录在对应随访任务中。',
    },
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
  const patient = await User.findById(plan.patientId)
    .select('assignedHealthManager assignedHealthPlanner').lean();
  const rows = buildAnnualPlanKickoffTasks(plan, patient);
  const clientResult = await Task.updateOne(
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
    const result = await FollowUp.updateOne(
      { sourceAnnualPlanId: plan._id, sourceType: 'annual_coordination', sourceScheduleKey: row.key },
      { $set: {
        patientId: plan.patientId, staffId: plan.createdBy || row.assignedTo, assignedTo: row.assignedTo,
        date: row.date, theme: row.theme, content: row.content, plannedContent: row.content,
        status: 'planned', aiStatus: 'approved', reviewRole: null,
      }, $setOnInsert: { sourceAnnualPlanId: plan._id, sourceType: 'annual_coordination', sourceScheduleKey: row.key } },
      { upsert: true },
    );
    if (result.upsertedCount) staffTasks++;
  }
  const scheduledFollowUps = await syncAnnualPlanFollowUps(plan);
  const warnings = [];
  if (!patient?.assignedHealthManager) warnings.push('客户尚未绑定健管专员，未生成健管启动待办');
  if (!patient?.assignedHealthPlanner) warnings.push('客户尚未绑定健康规划师，未生成规划师协同待办');
  return { clientTasks: clientResult.upsertedCount || 0, staffTasks, scheduledFollowUps, warnings };
}

module.exports = { buildAnnualPlanKickoffTasks, syncAnnualPlanTaskSplit };
