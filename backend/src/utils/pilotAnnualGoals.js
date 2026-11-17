const MODULES = ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'monitoring',
  'vaccine', 'nutrition_assessment', 'personalized_followups', 'lifestyle'];
const DIMENSIONS = new Set(['', 'data', 'symptom', 'lifestyle']);
const LIFESTYLE = new Set(['diet', 'exercise', 'sleep', 'smoking', 'alcohol', 'mood']);
const text = (value, max) => String(value || '').trim().slice(0, max);

function candidates(plan) {
  const rows = [];
  for (const key of MODULES) {
    for (const [index, action] of (plan.moduleData?.[key]?.records || []).entries()) {
      const sourceIds = [...new Set((action.sourceIds || []).map(String).filter(Boolean))];
      const ids = sourceIds.length ? sourceIds : [`plan-action:${plan._id}:${key}:${index}`];
      for (const issueId of ids) rows.push({ issueId, moduleKey: key, index,
        sourceTitle: text(action.items || action.name || action.title || action.department || action.purpose || action.focus || key, 240) });
    }
  }
  return [...new Map(rows.map(row => [row.issueId, row])).values()];
}

function normalize(plan, submitted, now = new Date()) {
  if (!Array.isArray(submitted) || !submitted.length || submitted.length > 32) throw new Error('请选择1至32项管理目标');
  const allowed = new Map(candidates(plan).map(row => [row.issueId, row]));
  const previous = new Map((plan.moduleData?.management_targets?.records || []).map(row => [row.issueId, row]));
  const seen = new Set();
  return submitted.map(input => {
    const issueId = String(input?.issueId || '');
    if (!allowed.has(issueId) || seen.has(issueId)) throw new Error('目标关联的原方案事项已变化或重复，请刷新');
    seen.add(issueId);
    const goal = text(input.goal, 241), focus = text(input.focus, 501), baseline = text(input.baseline, 501);
    const goalDimension = String(input.goalDimension || '');
    if (!goal || goal.length > 240 || !focus || focus.length > 500 || baseline.length > 500 || !DIMENSIONS.has(goalDimension))
      throw new Error('请填写有效的目标、行动重点与维度');
    const symptomTerm = text(input.symptomTerm, 81);
    const lifestyleType = String(input.lifestyleType || '');
    if (symptomTerm.length > 80 || goalDimension === 'lifestyle' && !LIFESTYLE.has(lifestyleType)
      || goalDimension !== 'lifestyle' && lifestyleType || goalDimension !== 'symptom' && symptomTerm)
      throw new Error('症状或生活方式追踪类别无效');
    const goalMetric = goalDimension === 'data' ? input.goalMetric || null : null;
    if (!require('./managementGoalMetrics').validate(goalMetric)) throw new Error('数据目标指标无效');
    if (input.nutritionRelevant !== undefined && typeof input.nutritionRelevant !== 'boolean'
      || input.rehabRelevant !== undefined && typeof input.rehabRelevant !== 'boolean') throw new Error('专业评估选择无效');
    const source = allowed.get(issueId), old = previous.get(issueId);
    const unchanged = old && ['goal', 'focus', 'baseline', 'goalDimension', 'symptomTerm', 'lifestyleType', 'goalMetric',
      'nutritionRelevant', 'rehabRelevant'].every(key => JSON.stringify(old[key] || null) === JSON.stringify(input[key] || null));
    return { issueId, sourceTitle: source.sourceTitle, goal, focus, baseline, goalDimension,
      symptomTerm: goalDimension === 'symptom' ? symptomTerm : '',
      lifestyleType: goalDimension === 'lifestyle' ? lifestyleType : '', goalMetric,
      nutritionRelevant: input.nutritionRelevant === true, rehabRelevant: input.rehabRelevant === true,
      effectiveAt: unchanged && old.effectiveAt ? old.effectiveAt : now };
  });
}

module.exports = { candidates, normalize };
