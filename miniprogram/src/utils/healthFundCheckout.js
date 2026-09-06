function policyLimit(type, value, amount) {
  if (type === 'percentage') return amount * Math.min(100, Math.max(0, Number(value) || 0)) / 100;
  if (type === 'fixedAmount') return Math.max(0, Number(value) || 0);
  return amount;
}

function corporateProductEligible(policy, product, productRule) {
  const mode = productRule?.mode || 'inherit';
  if (mode === 'disabled') return false;
  if (mode !== 'inherit') return true;
  if (policy?.eligibleCategories?.length && !policy.eligibleCategories.includes(product?.category || '')) return false;
  if (policy?.eligibleProductIds?.length
    && !policy.eligibleProductIds.map(String).includes(String(product?.id || product?._id || ''))) return false;
  return true;
}

function maxFundDeduction(healthFund, amount, product) {
  const orderAmount = Math.max(0, Number(amount) || 0);
  const policy = healthFund?.policy || {};
  if (orderAmount < (Number(policy.minOrderAmount) || 0)) return 0;

  // 自有基金只受余额和订单金额限制；企业商品范围、商品开关和商品上限
  // 都只约束企业赠送基金，与后端 validateHealthFundDeduction 保持一致。
  const personal = Math.min(Number(healthFund?.personal) || 0, orderAmount);
  const productRule = product?.healthFundDeduction;
  let corporate = 0;
  if (healthFund?.rule?.enabled !== false && corporateProductEligible(policy, product, productRule)) {
    const productLimit = productRule?.mode && !['inherit', 'unlimited'].includes(productRule.mode)
      ? policyLimit(productRule.mode, productRule.value, orderAmount)
      : orderAmount;
    const corporateLimit = Math.min(
      policyLimit(policy.corporateDeductionType, policy.corporateDeductionValue, orderAmount),
      productLimit,
    );
    corporate = Math.min(Number(healthFund?.corporate) || 0, corporateLimit);
  }
  return Math.max(0, Math.min(orderAmount, personal + corporate));
}

module.exports = { policyLimit, corporateProductEligible, maxFundDeduction };
