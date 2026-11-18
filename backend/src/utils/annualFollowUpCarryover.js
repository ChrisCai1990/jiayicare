const MODULES = ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine'];

function identity(row) {
  const module = String(row.sourceScheduleKey || '').split(':')[0];
  const ids = [...new Set((row.managementIssueIds || []).map(String).filter(id => id.startsWith('management_issue:')))].sort();
  return MODULES.includes(module) && ids.length ? `${module}|${ids.join('|')}` : '';
}

function findCarryovers(desired, prior) {
  const desiredByKey = new Map(), priorByKey = new Map();
  for (const row of desired) {
    const key = identity(row);
    if (key) desiredByKey.set(key, [...(desiredByKey.get(key) || []), row]);
  }
  for (const row of prior) {
    const key = identity(row);
    if (key && ['planned', 'in_progress', 'missed'].includes(row.status)) priorByKey.set(key, [...(priorByKey.get(key) || []), row]);
  }
  const matches = [];
  for (const [key, rows] of desiredByKey) {
    const old = priorByKey.get(key) || [];
    if (rows.length === 1 && old.length === 1) matches.push({ desired: rows[0], prior: old[0] });
  }
  return matches;
}

function planCandidates(plan) {
  return MODULES.flatMap(key => (plan.moduleData?.[key]?.records || []).map((record, index) => ({
    sourceScheduleKey: `${key}:candidate:${index}`,
    managementIssueIds: record.sourceIds || [],
  })));
}

module.exports = { identity, findCarryovers, planCandidates };
