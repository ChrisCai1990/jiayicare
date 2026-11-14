const assignmentFields = [
  'assignedFamilyDoctor', 'assignedNutritionist', 'assignedSpecialist',
  'assignedTcmDoctor', 'assignedPsychologist', 'assignedRehabSpecialist',
  'assignedMedicalAssistant', 'assignedHealthManager', 'assignedHealthPlanner',
];
const same = (a, b) => String(a?._id || a || '') === String(b?._id || b || '');
const assignedIds = patient => assignmentFields.map(key => patient?.[key]).filter(Boolean);
const canUseGroupModule = permissions => !!permissions?.patients?.view;
const isAssignedHealthManager = (patient, staff) => !!patient && !!staff &&
  same(patient.assignedHealthManager, staff._id);
const isAssignedLeader = (patient, staff) => !!patient && !!staff &&
  (same(patient.assignedFamilyDoctor, staff._id) ||
    same(patient.assignedNutritionist, staff._id) ||
    same(patient.assignedMedicalAssistant, staff._id) ||
    same(patient.assignedHealthManager, staff._id));

function canCustomerAccess(group, customer) {
  return !!group && group.status === 'active' && (group.memberIds || []).length > 0 &&
    !!customer && !customer.isDeleted &&
    same(group.patientId, customer._id) && same(group.tenantId, customer.tenantId);
}
function canStaffAccess(group, patient, staff) {
  return !!group && group.status === 'active' && !!patient && !patient.isDeleted &&
    !!staff && staff.staffStatus !== 'inactive' &&
    same(group.patientId, patient._id) && same(group.tenantId, patient.tenantId) &&
    same(group.tenantId, staff.tenantId) &&
    (staff.role === 'superadmin' || (assignedIds(patient).some(id => same(id, staff._id)) &&
      (group.memberIds || []).some(id => same(id, staff._id))));
}
function canMentorObserve(group, patient, mentor, mentoredIds) {
  return !!group && group.status === 'active' && !!patient && !patient.isDeleted &&
    !!mentor && mentor.staffStatus !== 'inactive' &&
    same(group.patientId, patient._id) && same(group.tenantId, patient.tenantId) &&
    same(group.tenantId, mentor.tenantId) &&
    assignedIds(patient).some(id => (group.memberIds || []).some(memberId => same(id, memberId)) &&
      mentoredIds.some(teamId => same(id, teamId)));
}
function needsStaffReply(group) {
  return !!group?.lastCustomerMessageAt &&
    (!group.lastStaffMessageAt || +new Date(group.lastCustomerMessageAt) > +new Date(group.lastStaffMessageAt));
}
module.exports = { assignmentFields, assignedIds, canUseGroupModule, isAssignedHealthManager, isAssignedLeader, canCustomerAccess, canStaffAccess,
  canMentorObserve, needsStaffReply, same };
