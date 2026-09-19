// Monetary allocations are made in integer cents. Each item's cash + coupon +
// fund must equal its price, and the cash sum must equal the gateway payment.
function cents(value) {
  const number = Number(value);
  const result = Math.round(number * 100);
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(result)) throw new Error('商品或抵扣金额无效');
  return result;
}

function splitCents(amount, capacities) {
  const total = capacities.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(amount) || amount < 0 || amount > total || capacities.some(v => !Number.isSafeInteger(v) || v < 0)) throw new Error('抵扣金额超过可用金额');
  if (!total) return capacities.map(() => 0);
  const parts = capacities.map(value => Number(BigInt(amount) * BigInt(value) / BigInt(total)));
  let remaining = amount - parts.reduce((sum, value) => sum + value, 0);
  // Largest remainder, deterministic on ties; never allocate above capacity.
  const ranked = capacities.map((value, index) => ({ index, remainder: BigInt(amount) * BigInt(value) % BigInt(total) }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const { index } of ranked) if (remaining && parts[index] < capacities[index]) { parts[index]++; remaining--; }
  return parts;
}

function paymentOrderQuery(orderId) {
  return { $or: [{ order: orderId }, { 'allocations.order': orderId }] };
}

function paymentAllocations(payment) {
  const rows = payment.allocations?.length ? payment.allocations : [{ order: payment.order, amount: payment.amount }];
  if (new Set(rows.map(row => String(row.order))).size !== rows.length || rows.reduce((sum, row) => sum + cents(row.amount), 0) !== cents(payment.amount)) throw new Error('支付分摊金额不一致，请人工核对');
  return rows;
}

module.exports = { cents, splitCents, paymentOrderQuery, paymentAllocations };
