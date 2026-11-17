const VITAL_NAMES = { weight: '体重', bloodSugar: '血糖', systolic: '收缩压', diastolic: '舒张压', heartRate: '心率' };
const OPERATORS = { lte: '≤', gte: '≥', lt: '<', gt: '>', eq: '=' };

function fromManagementTargets(records = []) {
  return records.filter(row => row.nutritionRelevant === true).slice(0, 10).map(row => {
    const goalMetric = row.goalMetric || {};
    const metric = String(goalMetric.name || VITAL_NAMES[goalMetric.key] || row.goalDimension === 'data' && row.goal || row.goal || '').split(/[·：:；;]/)[0].trim().slice(0, 100);
    const baseline = String(row.baseline || '').trim().slice(0, 200);
    const structuredTarget = goalMetric.targetValue !== undefined && goalMetric.targetValue !== ''
      ? `${OPERATORS[goalMetric.operator] || ''}${goalMetric.targetValue}${goalMetric.unit || ''}` : '';
    const target = String(structuredTarget || row.goal || '').trim().slice(0, 200);
    return { metric, baseline, target, sourceIssueId: String(row.issueId || '') };
  }).filter(row => row.metric && row.target);
}

function mergeAdvisorTargets(existing = [], records = []) {
  const result = existing.map(row => ({ ...row }));
  for (const candidate of fromManagementTargets(records)) {
    if (result.length >= 10) break;
    if (result.some(row => candidate.sourceIssueId && row.sourceIssueId === candidate.sourceIssueId || row.metric === candidate.metric)) continue;
    result.push(candidate);
  }
  return result;
}

module.exports = { fromManagementTargets, mergeAdvisorTargets };
