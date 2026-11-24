// Shared validation for full product edits and the fund settings page.
function validateProductFundRule(rule) {
  if (!rule || !['disabled', 'percentage'].includes(rule.mode)) {
    return '请逐个商品设置健康礼遇金抵扣比例或明确选择不支持';
  }
  if (rule.mode === 'percentage') {
    const value = Number(rule.value);
    if (!Number.isFinite(value) || value < 1 || value > 100) {
      return '商品抵扣比例须为1%-100%';
    }
  }
  return null;
}
function resolveProductFundRule(product, specificationLabel = '') {
  if (!product) return null;
  const prices = product.servicePrices || [];
  if (!prices.length) return product.healthFundDeduction;
  const row = prices.find(price => price.label === specificationLabel);
  if (!row) return null;
  return row.healthFundDeduction?.mode ? row.healthFundDeduction : product.healthFundDeduction;
}
module.exports = { validateProductFundRule, resolveProductFundRule };
