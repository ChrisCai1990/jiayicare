const idOf = value => String(value?._id || value || '');

// Read-only linkage for display; never infer completion of individual checks.
function projectCheckupLinks(plans, links) {
  const rows = plans.map(plan => plan.toObject ? plan.toObject() : { ...plan });
  const byId = new Map(rows.map(plan => [idOf(plan._id), plan]));
  for (const link of links) {
    const plan = byId.get(idOf(link._id));
    const service = byId.get(idOf(link.servicePlanId));
    if (!plan || !service || plan.type !== 'annual_checkup' || service.type !== 'medical_assist'
      || service.content?.serviceDomain !== 'annual_checkup'
      || !idOf(link.patientId) || idOf(plan.patientId) !== idOf(link.patientId)
      || idOf(service.patientId) !== idOf(link.patientId)) continue;
    if (links.filter(row => idOf(row._id) === idOf(link._id) || idOf(row.servicePlanId) === idOf(link.servicePlanId)).length !== 1) continue;
    plan.checkupServiceId = idOf(service._id);
  }
  return rows;
}
module.exports = { projectCheckupLinks };
