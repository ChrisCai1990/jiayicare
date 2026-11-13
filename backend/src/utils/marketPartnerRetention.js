function retentionPreview({ paidCents, directCostCents, teamIncentiveCents,
  partnerCommissionCents, transactionCostCents, floorBasisPoints = null }) {
  const values = [paidCents, directCostCents, teamIncentiveCents, partnerCommissionCents, transactionCostCents];
  if (values.some(value => !Number.isSafeInteger(value) || value < 0) || paidCents <= 0)
    throw new TypeError('请填写有效的实收与各项成本金额（分）');
  if (floorBasisPoints !== null && (!Number.isSafeInteger(floorBasisPoints)
    || floorBasisPoints < 0 || floorBasisPoints > 10000)) throw new TypeError('留存底线无效');
  const retainedCents = paidCents - directCostCents - teamIncentiveCents
    - partnerCommissionCents - transactionCostCents;
  const retentionBasisPoints = Math.round(retainedCents * 10000 / paidCents);
  return { retainedCents, retentionBasisPoints,
    belowFloor: floorBasisPoints === null ? null : retentionBasisPoints < floorBasisPoints };
}
module.exports = { retentionPreview };
