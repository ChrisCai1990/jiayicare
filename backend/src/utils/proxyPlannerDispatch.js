// Only the advisor-initiated medical proxy branch changes ownership.
// Existing pre-assignment, appointment-only, escort and supply workflows retain their routing.
function needsPlannerDispatch(data = {}, serviceName = '') {
  const plan = data.planSnapshot || data;
  return plan.initiationSource === 'staff_direct'
    && !data.medicalEscort && !plan.medicalEscort
    && !data.medicationProxy && !data.supplementProxy
    && !plan.medicationProxy && !plan.supplementProxy && !plan.medicalPlanning
    && !/专家约诊|陪同|代配药|代取药|代配营养素|就医规划/.test(serviceName || plan.serviceName || '');
}
module.exports = { needsPlannerDispatch };
