const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { selectedFromAnnualPlan } = require('../../../shared/nutritionComparisonMetrics.cjs');

function taskId(planId, attempt = 1) {
  const hex = crypto.createHash('sha256').update(`annual-nutrition-assessment:${planId}:${attempt}`).digest('hex').slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

function contentForPlan(plan) {
  const metrics = selectedFromAnnualPlan(plan);
  const goals = nutritionGoalsForPlan(plan);
  return `营养师核实膳食与生活方式；${metrics.length ? `本年度重点对比指标：${metrics.join('、')}` : '本年度按固定体成分指标评估'}。${goals.length ? `已确认的营养相关管理目标：${goals.map(row => `${row.goal}（重点：${row.focus}）`).join('；')}。` : ''}基线与阶段目标在营养方案中逐项确认。`;
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
    staffId: actor._id, patientId: patient._id, assignedTo: patient.assignedNutritionist,
    date: Number.isFinite(date.getTime()) ? date : now, type: 'phone', status: 'planned',
    theme: '年度标准营养评估', content, plannedContent: content,
    sourceAnnualPlanId: plan._id, sourceType: 'professional_assessment',
    sourceScheduleKey: `nutrition-assessment:standalone:${attempt}`, workflowKey: 'annual_nutrition_assessment',
    deliveryMode: 'single', deliveryType: 'nutrition_assessment', taskRole: 'executor',
    aiStatus: 'approved', reviewRole: null, reviewAssignedTo: null,
    formData: { annualNutritionMetrics: metrics, annualNutritionGoals: goals, annualYear: plan.year,
      plannedAssessmentDate: plannedDate || '' },
  };
}

async function dispatch(plan, patient, actor, FollowUp) {
  const query = { patientId: patient._id, sourceAnnualPlanId: plan._id, workflowKey: 'annual_nutrition_assessment' };
  const existing = await FollowUp.findOne({ ...query, status: { $ne: 'cancelled' } }).sort({ createdAt: 1 }).lean();
  if (existing) return { task: existing, reused: true };
  const cancelled = await FollowUp.countDocuments({ ...query, sourceType: 'professional_assessment', status: 'cancelled' });
  const task = buildTask(plan, patient, actor, cancelled + 1);
  const inserted = await FollowUp.updateOne({ _id: task._id }, { $setOnInsert: task }, { upsert: true, setDefaultsOnInsert: true });
  const saved = await FollowUp.findById(task._id).lean();
  return { task: saved, reused: !inserted.upsertedCount };
}

module.exports = { taskId, buildTask, contentForPlan, nutritionGoalsForPlan, dispatch };
