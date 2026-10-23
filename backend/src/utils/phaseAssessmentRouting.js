const ROLE_FIELDS = { familyDoctor: 'assignedFamilyDoctor', nutritionist: 'assignedNutritionist', healthManager: 'assignedHealthManager', psychologist: 'assignedPsychologist', rehabSpecialist: 'assignedRehabSpecialist', tcmDoctor: 'assignedTcmDoctor' };
const ROLE_LABELS = { familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员', psychologist: '心理咨询师', rehabSpecialist: '运动复健师', tcmDoctor: '中医师' };
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
  if (item.status === 'team_review') return (item.teamRoles || []).find(role => item.teamReviews?.[role]?.status !== 'approved') || null;
  return item.status === 'doctor_review' ? 'familyDoctor' : primaryRole(item);
}
function isAssignedPhaseReviewer(user, staff, role) {
  return staff.role === 'superadmin' || Boolean(staff.role === role && ROLE_FIELDS[role] && user[ROLE_FIELDS[role]] && String(user[ROLE_FIELDS[role]]) === String(staff._id));
}
function reviewQueueFilter(role) {
  // Superseded pilot drafts remain for audit but are never actionable again.
  const currentOnly = { periodKey: { $not: /-legacy-/ } };
  if (role === 'superadmin') return { ...currentOnly, status: { $in: ['pending', 'nutrition_review', 'professional_review', 'doctor_review', 'team_review', 'rejected', 'archive_pending'] } };
  const teamFilter = { status: 'team_review', teamRoles: role, [`teamReviews.${role}.status`]: { $ne: 'approved' } };
  const archiveFilter = { status: 'archive_pending', finalReviewRole: role };
  if (role === 'familyDoctor') return { ...currentOnly, $or: [{ status: 'doctor_review' }, { status: 'rejected', primaryReviewRole: role }, archiveFilter, teamFilter] };
  const primaryFilter = role === 'nutritionist' ? { $or: [{ primaryReviewRole: role }, { primaryReviewRole: { $exists: false } }] } : { primaryReviewRole: role };
  return { ...currentOnly, $or: [{ ...primaryFilter, status: { $in: role === 'nutritionist' ? ['pending', 'nutrition_review', 'rejected'] : ['professional_review', 'rejected'] } }, archiveFilter, teamFilter] };
}
module.exports = { ROLE_FIELDS, ROLE_LABELS, DOMAIN_ROLES, routingFor, initialReviewStatus, primaryRole, currentReviewer, isAssignedPhaseReviewer, reviewQueueFilter };
