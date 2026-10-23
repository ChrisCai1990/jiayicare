// A mutually authorized adult family link or direct minor guardianship permits report access.
async function reportOwner(user, patientId, checkGuardian = require('./guardianChildAccess').guardianChild,
  checkFamily = require('./authorizedFamilyMember').authorizedFamilyMember) {
  if (!patientId || String(patientId) === String(user._id)) return user._id;
  const access = await checkGuardian(user, String(patientId));
  if (access?.child?._id) return access.child._id;
  const member = await checkFamily(user, String(patientId));
  return member?._id || null;
}

async function canAccessReport(user, report, checkGuardian, checkFamily) {
  return !!report?.user && !!(await reportOwner(user, report.user, checkGuardian, checkFamily));
}

async function canManageReport(user, report, checkGuardian = require('./guardianChildAccess').guardianChild) {
  if (!report?.user) return false;
  if (String(report.user) === String(user._id)) return true;
  return !!(await checkGuardian(user, String(report.user)));
}

module.exports = { reportOwner, canAccessReport, canManageReport };
