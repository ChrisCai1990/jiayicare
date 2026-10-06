// Reuse the detail page's assignment scope, including mentor/subordinate IDs.
const fields = ['assignedFamilyDoctor', 'assignedNutritionist', 'assignedSpecialist',
  'assignedTcmDoctor', 'assignedPsychologist', 'assignedRehabSpecialist',
  'assignedMedicalAssistant', 'assignedHealthManager', 'assignedHealthPlanner'];
function patientEditScope(staff, visibleIds, toId) {
  if (!staff?.tenantId) throw new Error('员工未归属机构');
  const filter = { tenantId: toId(staff.tenantId), isDeleted: { $ne: true } };
  if (staff.role !== 'superadmin') {
    const ids = [...new Set(visibleIds.map(String))].map(toId);
    filter.$or = fields.map(field => ({ [field]: { $in: ids } }));
  }
  return filter;
}
function patientClaimScope(user, staff, visibleIds) {
  if (!user || user.isDeleted || !staff?.tenantId || String(user.tenantId) !== String(staff.tenantId)) return null;
  const assigned = fields.map(field => user[field]).filter(Boolean).map(String);
  if (staff.role !== 'superadmin' && assigned.length && !assigned.some(id => visibleIds.map(String).includes(id))) return null;
  // Preserve assignment state between the permission check and the write.
  return { _id: user._id, tenantId: user.tenantId, isDeleted: { $ne: true },
    ...Object.fromEntries(fields.map(field => [field, user[field] || null])) };
}
module.exports = { patientEditScope, patientClaimScope };
