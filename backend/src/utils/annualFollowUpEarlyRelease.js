// A plan-level exception set only by the one-time, uniquely matched operator script.
// This never records customer consent or unlocks other annual execution tasks.

function released(plan) {
  return !!(plan?.followUpReleasedAt && plan?.pushedAt && plan?.reviewStatus === 'approved'
    && !plan?.continuitySource?.previousPlanId);
}

module.exports = { released };
