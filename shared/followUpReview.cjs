const id = value => String(value?._id || value || '');
function postVisit(item) {
  return item?.sourceType === 'order' && (!!item.formData?.generatedFromExpertAppointment || !!item.formData?.generatedFromMedicalEscort || /^(expert_appointment_followup|medical_escort_followup):/.test(item.sourceScheduleKey || ''));
}
function reviewer(item, patient) {
  if (require('./annualNutrition.cjs').isTask(item)) return patient?.assignedFamilyDoctor || item?.reviewAssignedTo || null;
  return item?.reviewAssignedTo || (postVisit(item) ? patient?.assignedFamilyDoctor : item?.assignedTo) || null;
}
function executor(item, patient) {
  if (!postVisit(item) || item.aiStatus !== 'pending' || item.reviewAssignedTo) return item?.assignedTo || null;
  // Legacy post-visit drafts stored the advisor in the executor slot.
  if (!item.assignedTo || id(item.assignedTo) === id(patient?.assignedFamilyDoctor) || id(item.assignedTo) === id(item.staffId)) return patient?.assignedHealthManager || null;
  return item.assignedTo;
}
function canReview(item, staff, patient) {
  if (item?.aiStatus !== 'pending' || !staff?.role) return false;
  if (staff.role === 'superadmin') return true;
  if (staff.role !== (item.reviewRole || 'familyDoctor')) return false;
  const owner = reviewer(item, patient);
  if (postVisit(item) && !owner) return false;
  return !owner || (!!staff._id && id(owner) === id(staff._id));
}
module.exports = { postVisit, reviewer, executor, canReview };
