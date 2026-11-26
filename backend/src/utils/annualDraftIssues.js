const { validate } = require('./annualPlanPublishValidation');

// Validate each item independently, then validate relationships on the full plan.
function draftIssues(data, today) {
  const issues = [];
  for (const [key, module] of Object.entries(data)) {
    if (!module || module.enabled === false) continue;
    const multi = Array.isArray(module.records);
    const rows = multi ? module.records : [module];
    rows.forEach((row, index) => {
      // Group membership and shared dates need all members to be present.
      const individual = row.visitGroupId ? { ...row, visitGroupId: '', serviceMode: row.serviceMode === 'shared' ? 'reminder' : row.serviceMode } : row;
      const message = validate({ management_targets: data.management_targets, [key]: multi ? { ...module, records: [individual] } : individual }, today);
      if (message) issues.push({ key, index, title: row.reviewItems?.join('、') || row.items || row.reason || row.name || '', message });
    });
  }
  const overall = validate(data, today);
  if (overall && !issues.some(issue => issue.message === overall)) {
    const group = Object.entries(data).flatMap(([key, m]) => (m?.records || []).map((row, index) => ({ key, row, index })))
      .find(({row}) => row.visitGroupId && overall.includes(row.visitGroupId));
    issues.push({ key: group?.key || 'details', index: group?.index, message: overall });
  }
  return issues;
}
module.exports = { draftIssues };
