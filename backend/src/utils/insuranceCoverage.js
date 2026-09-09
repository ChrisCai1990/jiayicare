const INSURANCE_SCENARIOS = new Set(['outpatient', 'inpatient', 'emergency', 'special_drug', 'reimbursement', 'dispute']);

function isDateWithinCoverage(record, now = new Date()) {
  const value = new Date(now);
  if (Number.isNaN(value.getTime())) return false;
  if (record?.startAt && value < new Date(record.startAt)) return false;
  if (record?.endAt) {
    const end = new Date(record.endAt);
    end.setHours(23, 59, 59, 999);
    if (value > end) return false;
  }
  return true;
}

function canUseInsuranceCoverage(policy, enrollment, now = new Date()) {
  return policy?.status === 'active'
    && enrollment?.status === 'active'
    && isDateWithinCoverage(policy, now)
    && isDateWithinCoverage(enrollment, now);
}

function isInsuranceScenario(value) {
  return INSURANCE_SCENARIOS.has(value);
}

module.exports = { INSURANCE_SCENARIOS, isDateWithinCoverage, canUseInsuranceCoverage, isInsuranceScenario };
