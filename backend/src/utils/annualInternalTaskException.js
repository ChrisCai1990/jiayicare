// One named plan may start staff work after a documented advisor review while
// the customer cannot confirm in the app. This is not customer confirmation.
const PATIENT_ID = '6a4f3531962a3b13144af513';
const PLAN_ID = '6ac6169e07e2feec6321fb77';

function eligible(plan) {
  return String(plan?._id || '') === PLAN_ID && String(plan?.patientId || '') === PATIENT_ID
    && plan?.year === 2026 && !!plan?.pushedAt && plan?.reviewStatus === 'approved'
    && !plan?.confirmedAt && !plan?.continuitySource?.previousPlanId;
}

function serviceReleased(plan) {
  return eligible(plan) && !!plan?.serviceTaskReleasedAt && !!plan?.followUpReleasedAt;
}

module.exports = { eligible, serviceReleased };
