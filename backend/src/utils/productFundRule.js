// Shared validation for full product edits and the fund settings page.
function validateProductFundRule(rule) {
  if (!rule || !['inherit', 'disabled', 'percentage', 'fixedAmount', 'unlimited'].includes(rule.mode)) {
    return '请选择有效的商品健康基金抵扣方式';
  }
  if (['percentage', 'fixedAmount'].includes(rule.mode)) {
    const value = Number(rule.value);
    if (!Number.isFinite(value) || value < (rule.mode === 'percentage' ? 1 : 0)
        || (rule.mode === 'percentage' && value > 100)) {
      return rule.mode === 'percentage' ? '商品抵扣比例须为1%-100%' : '商品抵扣金额须为非负数';
    }
  }
  return null;
}
module.exports = { validateProductFundRule };
