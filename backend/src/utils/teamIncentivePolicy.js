const ROLES = new Set(['familyDoctor', 'nutritionist', 'healthManager']);

function teamIncentiveCents({ role, ruleType, basisCents, basisPoints = 0, amountCents = 0, capCents = null }) {
  if (!ROLES.has(role)) throw new TypeError('unsupported team role');
  if (!Number.isSafeInteger(basisCents) || basisCents < 0) throw new TypeError('invalid basis');
  if (capCents !== null && (!Number.isSafeInteger(capCents) || capCents < 0)) throw new TypeError('invalid cap');
  let result;
  if (ruleType === 'percentage') {
    if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new TypeError('invalid rate');
    result = Math.round(basisCents * basisPoints / 10000);
  } else if (ruleType === 'fixedAmount') {
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new TypeError('invalid amount');
    result = amountCents;
  } else throw new TypeError('unknown rule type');
  return capCents === null ? result : Math.min(result, capCents);
}

module.exports = { ROLES, teamIncentiveCents };
