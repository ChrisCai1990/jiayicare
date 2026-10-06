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
module.exports = { patientEditScope };
