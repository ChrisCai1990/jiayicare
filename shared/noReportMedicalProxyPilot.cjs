// One simulated customer may exercise the direct medical proxy workflow without
// pre-existing documents. This does not waive service entitlement or staff checks.
const PILOT_PATIENT_ID = '6ac476d54f62812b84dd5d35';

function isNoReportMedicalProxyPilot(patientId) {
  return String(patientId?._id || patientId || '').toLowerCase() === PILOT_PATIENT_ID;
}

module.exports = { isNoReportMedicalProxyPilot };
