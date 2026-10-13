// Family service/payment links do not authorize access to adult health data.
// Only the account owner or an active direct guardian of a minor may manage a report.
async function reportOwner(user, patientId, checkGuardian = require('./guardianChildAccess').guardianChild) {
  if (!patientId || String(patientId) === String(user._id)) return user._id;
  const access = await checkGuardian(user, String(patientId));
  return access?.child?._id || null;
}

async function canAccessReport(user, report, checkGuardian) {
  return !!report?.user && !!(await reportOwner(user, report.user, checkGuardian));
}

module.exports = { reportOwner, canAccessReport };
