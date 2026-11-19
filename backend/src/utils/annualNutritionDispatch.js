const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { selectedFromAnnualPlan } = require('../../../shared/nutritionComparisonMetrics.cjs');

function draftModule(moduleData = {}) {
  const current = moduleData.nutrition_assessment || {};
  if (current.enabled === false) return { ...current, enabled: false };
  return { ...current, enabled: true,
    advisorTargets: current.advisorTargetsManuallyAdjusted ? current.advisorTargets || []
      : require('../../../shared/annualNutritionAdvisorTargets.cjs').mergeAdvisorTargets(current.advisorTargets || [], moduleData.management_targets?.records || []),
    nutritionComparisonMetrics: current.nutritionComparisonMetrics
      ?? require('../../../shared/nutritionComparisonMetrics.cjs').metricsFromTargets(moduleData.management_targets?.records) };
}

function taskId(planId, attempt = 1) {
  const hex = crypto.createHash('sha256').update(`annual-nutrition-assessment:${planId}:${attempt}`).digest('hex').slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

function contentForPlan(plan) {
  const metrics = selectedFromAnnualPlan(plan);
  const goals = nutritionGoalsForPlan(plan);
  const focus = plan?.moduleData?.nutrition_assessment?.records || [];
  const summary = require('../../../shared/nutritionComparisonMetrics.cjs').nutritionSummary(plan);
  const advisorTargets = plan?.moduleData?.nutrition_assessment?.advisorTargets || [];
  const catalog = require('../../../shared/annualNutritionAdvisorTargets.cjs');
  const advisorGoalText = advisorTargets.length ? `顾问纳入的异常指标与症状：${advisorTargets.map(row => `${(row.kind || catalog.kindFor(row.metric)) === 'symptom' ? '症状' : '指标'}${row.metric}${catalog.isInternalNutritionMetric(row.metric) ? '（仅内部监测）' : ''}（当前${row.baseline || '待核对'}，期望${row.target}）`).join('；')}。请核对后制定营养干预方案。` : '';
  return `营养师评估膳食、生活方式及体成分，形成营养方案。${advisorGoalText}营养相关管理目标：${goals.map(row => row.goal).join('；') || '待确认'}。相关问题：${summary.problems.join('、') || '研判中的营养相关问题'}。对比指标：${metrics.join('、') || '基础体成分指标'}。研判参考目标：${summary.references.join('；') || '未给出明确数值，由营养师结合原报告参考范围及实际情况制定'}。基线依据已有资料核实，阶段目标由营养师调整。${focus.length ? `专项重点：${focus.map(r=>[r.items, r.personalizedAdvice].filter(Boolean).join('：')).join('；')}。` : ''}医疗背景仅供参考，就医、检查及用药评估由对应医疗安排执行。`;

}

function nutritionGoalsForPlan(plan) {
  return (plan?.moduleData?.management_targets?.records || []).filter(row => row.nutritionRelevant === true && row.goal);
}

function buildTask(plan, patient, actor, attempt = 1, now = new Date()) {
  const metrics = selectedFromAnnualPlan(plan);
  const goals = nutritionGoalsForPlan(plan);
  const plannedDate = plan.moduleData?.nutrition_assessment?.executionDate;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(plannedDate || '')
    ? new Date(`${plannedDate}T09:00:00+08:00`) : now;
  const content = contentForPlan(plan);
  return {
    _id: taskId(plan._id, attempt), tenantId: patient.tenantId || null,
    staffId: actor._id, patientId: patient._id, assignedTo: plan.moduleData?.nutrition_assessment?.executorId || patient.assignedNutritionist,
    date: Number.isFinite(date.getTime()) ? date : now, type: 'phone', status: 'planned',
    theme: '年度标准营养评估', content, plannedContent: content,
    sourceAnnualPlanId: plan._id, sourceType: 'professional_assessment',
    ...(require('./annualFlowPilot').enabledForPlan(plan) ? { managementIssueIds: [...new Set(goals.map(row => String(row.issueId || '')).filter(Boolean))] } : {}),
    sourceScheduleKey: `nutrition-assessment:standalone:${attempt}`, workflowKey: 'annual_nutrition_assessment',
    deliveryMode: 'single', deliveryType: 'nutrition_assessment', taskRole: 'executor',
    aiStatus: 'approved', reviewRole: null, reviewAssignedTo: null,
    formData: { annualNutritionMetrics: metrics, annualNutritionGoals: goals, annualNutritionAdvisorTargets: plan?.moduleData?.nutrition_assessment?.advisorTargets || [], annualNutritionSummary: require('../../../shared/nutritionComparisonMetrics.cjs').nutritionSummary(plan), annualYear: plan.year,
      plannedAssessmentDate: plannedDate || '' },
  };
}

async function dispatch(plan, patient, actor, FollowUp) {
  const executorId = plan.moduleData?.nutrition_assessment?.executorId;
  if (executorId) {
    if (!mongoose.isValidObjectId(executorId)) throw new Error('执行营养师无效，请重新选择');
    const executor = await require('../models/Admin').findById(executorId).select('role staffStatus tenantId').lean();
    if (!executor || executor.role !== 'nutritionist' || executor.staffStatus === 'inactive'
      || String(executor.tenantId || '') !== String(patient.tenantId || '')) throw new Error('执行营养师不可用，请重新选择');
  }
  const query = { patientId: patient._id, sourceAnnualPlanId: plan._id, workflowKey: 'annual_nutrition_assessment' };
  const existing = await FollowUp.findOne({ ...query, status: { $ne: 'cancelled' } }).sort({ createdAt: 1 }).lean();
  if (existing) return { task: existing, reused: true };
  const cancelled = await FollowUp.countDocuments({ ...query, sourceType: 'professional_assessment', status: 'cancelled' });
  const task = buildTask(plan, patient, actor, cancelled + 1);
  const inserted = await FollowUp.updateOne({ _id: task._id }, { $setOnInsert: task }, { upsert: true, setDefaultsOnInsert: true });
  const saved = await FollowUp.findById(task._id).lean();
  return { task: saved, reused: !inserted.upsertedCount };
}

module.exports = { taskId, buildTask, contentForPlan, nutritionGoalsForPlan, dispatch, draftModule };
