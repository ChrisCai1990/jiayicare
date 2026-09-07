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

  // 与服务端保持同一顺序：先使用自有基金，再以剩余应付金额为基数
  // 应用商品配置的企业基金比例。平台不再叠加固定金额上限。
  const personal = Math.min(Number(healthFund?.personal) || 0, orderAmount);
  const remainingAfterPersonal = Math.max(0, orderAmount - personal);
  const productRule = product?.healthFundDeduction;
  let corporate = 0;
  if (healthFund?.rule?.enabled !== false && corporateProductEligible(policy, product, productRule)) {
    const productLimit = productRule?.mode && !['inherit', 'unlimited'].includes(productRule.mode)
      ? policyLimit(productRule.mode, productRule.value, remainingAfterPersonal)
      : remainingAfterPersonal;
    corporate = Math.min(Number(healthFund?.corporate) || 0, productLimit);
  }
  return Math.max(0, Math.min(orderAmount, personal + corporate));
}

module.exports = { policyLimit, corporateProductEligible, maxFundDeduction };
