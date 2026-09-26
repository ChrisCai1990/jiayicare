function latest(rows, key) {
  return rows.reduce((value, row) => !value || (row[key] && new Date(row[key]) > new Date(value)) ? row[key] : value, null);
}

function deriveJourneySnapshot({ reports = [], drafts = [], annualPlan = null, followUps = [], now = new Date() }) {
  const parsed = reports.filter(row => row.aiStatus === 'reviewed');
  const managerAudited = reports.filter(row => row.audit_status === 'audited');
  const advisorAudited = reports.filter(row => row.familyDoctorAudit?.status === 'audited');
  const approvedDrafts = drafts.filter(row => row.status === 'approved');
  const assigned = followUps.filter(row => row.assignedTo);
  const completed = followUps.filter(row => row.status === 'completed');
  const overdue = followUps.filter(row => ['planned', 'in_progress', 'missed'].includes(row.status) && row.date && new Date(row.date) < now);
  return {
    report: { total: reports.length, parsed: parsed.length, managerAudited: managerAudited.length, advisorAudited: advisorAudited.length, latestParsedAt: latest(parsed, 'reviewedAt') },
    draft: { total: drafts.length, approved: approvedDrafts.length, latestReviewedAt: latest(drafts, 'advisorReviewedAt') },
    annualPlan: annualPlan ? { id: String(annualPlan._id), reviewStatus: annualPlan.reviewStatus, pushedAt: annualPlan.pushedAt || null, confirmedAt: annualPlan.confirmedAt || null } : null,
    followUp: { total: followUps.length, assigned: assigned.length, completed: completed.length, overdue: overdue.length },
  };
}

function candidateStatus(snapshot) {
  if (snapshot.annualPlan) return 'historical';
  if (!snapshot.report.parsed) return 'waiting_parse';
  if (!snapshot.report.managerAudited) return 'waiting_manager_audit';
  if (!snapshot.report.advisorAudited) return 'waiting_advisor_audit';
  return 'ready';
}

module.exports = { deriveJourneySnapshot, candidateStatus };
