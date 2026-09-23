// Stable per-item association; never fall back to the whole annual plan.
const appointmentModules = ['medical_treatment', 'specialist_collab', 'checkup_completion', 'abnormal_followup', 'vaccine', 'functional_medicine', 'annual_checkup'];
function followUpKey(task) {
  const request = task.formData?.serviceRequest;
  const match = /^service-request:([^:]+):\d+:(\d{4}-\d{2}-\d{2})$/.exec(task.sourceScheduleKey || '');
  if (!request || !match || request.moduleKey !== match[1]) return null;
  if (match[1] === 'annual_checkup') return `annual_checkup:${match[2]}`;
  const row = request.itemSnapshot || {};
  const fallback = { medical_treatment: '就医安排', specialist_collab: '联合会诊', checkup_completion: '体检完善', abnormal_followup: '异常复查', vaccine: '疫苗接种', functional_medicine: '功能医学检测' };
  const label = String(row.hospital || row.name || row.items || row.standardPlanName || fallback[match[1]] || '').trim();
  return label ? `${match[1]}:${match[2]}:${label}` : null;
}
function isAssistance(task) {
  return task.sourceType === 'scheduled' && !!task.sourceAnnualPlanId
    && ['single', 'managed'].includes(task.deliveryMode)
    && appointmentModules.includes(String(task.sourceScheduleKey || '').split(':')[0]);
}
function needsBooking(task) {
  return isAssistance(task) && ['planned', 'in_progress', 'missed'].includes(task.status)
    && !task.serviceTracking?.linkId && task.annualBooking?.status !== 'booked';
}
function isBookingRequest(task) {
  return task.sourceType === 'annual_service' && task.workflowKey === 'service_request' && appointmentModules.includes(task.formData?.serviceRequest?.moduleKey);
}
module.exports = { followUpKey, isAssistance, needsBooking, isBookingRequest };
