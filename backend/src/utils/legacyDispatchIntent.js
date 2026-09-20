const { randomUUID } = require('node:crypto');
function armLegacyDispatchIntent(report, staff, input) {
  if (report.audit_status !== 'audited' || !input.abnormalItems?.length || report.legacyDispatchIntent) return;
  report.legacyDispatchIntent = { token: randomUUID(), status: 'pending', createdAt: new Date(),
    staff: { _id: staff._id, name: staff.name, username: staff.username },
    input: JSON.parse(JSON.stringify(input)),
    source: { patientId: String(report.user), planId: String(report.planId || ''), sourceHealthPlanId: String(report.sourceHealthPlanId || '') } };
  // Two loaded audit requests cannot overwrite the first durable intent.
  if (!report.isNew) report.$where = { ...report.$where, legacyDispatchIntent: null };
}
module.exports = { armLegacyDispatchIntent };
