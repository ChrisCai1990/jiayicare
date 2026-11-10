// All monetary inputs and outputs are integer fen. Rates are basis points.
const POLICIES = Object.freeze({
  consumer365: { kind: 'annual', first: 2000, renewals: { 2: 1000, 3: 500, 4: 500, 5: 500 } },
  annualAdvisor: { kind: 'annual', tiers: [1000, 1500, 1800, 2000], renewals: { 2: 800, 3: 500, 4: 500, 5: 500 }, quickClose: true },
  premiumAdvisor: { kind: 'annual', tiers: [1000, 1500, 1800, 2000], renewals: { 2: 800, 3: 500, 4: 500, 5: 500 }, quickClose: true },
  weightManagement: { kind: 'first', tiers: [800, 1000, 1200, 1500], quickClose: true },
  chronicManagement: { kind: 'first', first: 1000, quickClose: true },
  medicalAssist: { kind: 'first', first: 1500, directReferralRequired: true },
  oneStopMedical: { kind: 'first', first: 1000 },
  assessment: { kind: 'every', first: 1000 },
  psychology: { kind: 'every', first: 1000 },
  rehabilitation: { kind: 'every', first: 1000 },
});

function requireCents(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('paidCents must be a nonnegative safe integer');
}

function rateFor({ policy, periodNumber, monthlyQualifiedCount = 1, directReferral = false }) {
  if (!policy || typeof policy !== 'object') throw new TypeError('commission policy required');
  if (!Number.isSafeInteger(periodNumber) || periodNumber < 1) throw new TypeError('periodNumber must be positive');
  if (!Number.isSafeInteger(monthlyQualifiedCount) || monthlyQualifiedCount < 1) throw new TypeError('monthlyQualifiedCount must be positive');
  if (policy.directReferralRequired && !directReferral) return 0;
  if (policy.kind === 'annual' && periodNumber > 1) return policy.renewals?.[periodNumber] || 0;
  if (policy.kind === 'first' && periodNumber > 1) return 0;
  if (!['annual', 'first', 'every'].includes(policy.kind)) throw new TypeError('unknown policy kind');
  const basisPoints = policy.tiers
    ? policy.tiers[Math.min(monthlyQualifiedCount, policy.tiers.length) - 1]
    : policy.first || 0;
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new TypeError('invalid commission rate');
  return basisPoints;
}

function commissionCents({ paidCents, policy, periodNumber = 1, monthlyQualifiedCount = 1, directReferral = false,
  firstConversationAt = null, paidAt = null, quickCloseCapCents = 100000 }) {
  requireCents(paidCents);
  const basisPoints = rateFor({ policy, periodNumber, monthlyQualifiedCount, directReferral });
  const baseCents = Math.round(paidCents * basisPoints / 10000);
  let quickCloseCents = 0;
  if (policy.quickClose && periodNumber === 1 && basisPoints > 0 && firstConversationAt && paidAt) {
    const elapsed = new Date(paidAt).getTime() - new Date(firstConversationAt).getTime();
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 7 * 86400000) {
      quickCloseCents = Math.min(Math.round(paidCents / 100), quickCloseCapCents);
    }
  }
  return { basisPoints, baseCents, quickCloseCents, totalCents: baseCents + quickCloseCents };
}

// An immutable correction entry is the only way to change an already recorded amount.
function adjustmentCents(previousCents, recomputedCents) {
  if (!Number.isSafeInteger(previousCents) || !Number.isSafeInteger(recomputedCents)) throw new TypeError('invalid amount');
  return recomputedCents - previousCents;
}

module.exports = { POLICIES, rateFor, commissionCents, adjustmentCents };
