function calculateAttribution(commission, staff, productRule) {
  // 核销服务绩效保留原核销规则；转介绍按新人员的个人规则优先计算。
  if (commission.role !== 'referrer') return { commissionAmount: commission.commissionAmount, commissionRate: commission.commissionRate };
  const personal = staff?.personalPerformanceRule;
  const rule = personal && personal.ruleType !== 'none' ? personal : productRule;
  if (!rule || rule.ruleType === 'none') return { commissionAmount: 0, commissionRate: 0 };
  const rate = rule.ruleType === 'percentage' ? (Number(rule.referrerRate) || 0) / 100 : 0;
  const amount = rule.ruleType === 'fixedAmount' ? Number(rule.referrerAmount) || 0 : Math.round(Number(commission.orderAmount) * rate * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0) throw new Error('佣金规则金额无效');
  return { commissionAmount: amount, commissionRate: rate };
}
module.exports = { calculateAttribution };
