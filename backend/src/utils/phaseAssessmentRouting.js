const ROLE_FIELDS = { familyDoctor: 'assignedFamilyDoctor', nutritionist: 'assignedNutritionist', rehabSpecialist: 'assignedRehabSpecialist', tcmDoctor: 'assignedTcmDoctor' };
const ROLE_LABELS = { familyDoctor: '健康顾问', nutritionist: '营养师', rehabSpecialist: '运动复健师', tcmDoctor: '药食同源专业人员' };
const DOMAIN_ROLES = { comprehensive: 'familyDoctor', multidisciplinary: 'familyDoctor', nutrition: 'nutritionist', exercise: 'rehabSpecialist', tcm: 'tcmDoctor' };
function routingFor(domain = 'comprehensive', mode = 'routine') {
  const selected = mode === 'intensive_nutrition' ? 'nutrition' : domain;
  if (!DOMAIN_ROLES[selected]) throw new Error('评估领域无效');
  const primaryReviewRole = DOMAIN_ROLES[selected];
  return { assessmentDomain: selected, primaryReviewRole, status: initialReviewStatus(primaryReviewRole) };
}
function initialReviewStatus(role) { return role === 'familyDoctor' ? 'doctor_review' : role === 'nutritionist' ? 'nutrition_review' : 'professional_review'; }
function primaryRole(item) { return item.primaryReviewRole || 'nutritionist'; } // 旧记录不悄悄转移审核人。
function currentReviewer(item) {
  if (['finalized', 'approved'].includes(item.status)) return null;
  if (item.status === 'archive_pending') return item.finalReviewRole || primaryRole(item);
  return item.status === 'doctor_review' ? 'familyDoctor' : primaryRole(item);
}
function isAssignedPhaseReviewer(user, staff, role) {
  return staff.role === 'superadmin' || Boolean(staff.role === role && ROLE_FIELDS[role] && user[ROLE_FIELDS[role]] && String(user[ROLE_FIELDS[role]]) === String(staff._id));
}
function reviewQueueFilter(role) {
  if (role === 'superadmin') return { status: { $in: ['pending', 'nutrition_review', 'professional_review', 'doctor_review', 'rejected', 'archive_pending'] } };
  const archiveFilter = { status: 'archive_pending', finalReviewRole: role };
  if (role === 'familyDoctor') return { $or: [{ status: 'doctor_review' }, { status: 'rejected', primaryReviewRole: role }, archiveFilter] };
  const primaryFilter = role === 'nutritionist' ? { $or: [{ primaryReviewRole: role }, { primaryReviewRole: { $exists: false } }] } : { primaryReviewRole: role };
  return { $or: [{ ...primaryFilter, status: { $in: role === 'nutritionist' ? ['pending', 'nutrition_review', 'rejected'] : ['professional_review', 'rejected'] } }, archiveFilter] };
}
module.exports = { ROLE_FIELDS, ROLE_LABELS, DOMAIN_ROLES, routingFor, initialReviewStatus, primaryRole, currentReviewer, isAssignedPhaseReviewer, reviewQueueFilter };
