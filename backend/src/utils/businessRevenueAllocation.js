// Attribute verified net cash once, using the configuration frozen on purchase.
function allocations(order, netCents) {
  const items = order.businessAllocationsSnapshot?.length
    ? order.businessAllocationsSnapshot : order.serviceItemsSnapshot || [];
  const hasExactAmounts = items.length > 0 && items.every(item => item.allocationAmountCents != null);
  const weights = hasExactAmounts ? items.map(item => Number(item.allocationAmountCents)) : [];
  if (!Number.isSafeInteger(netCents) || netCents < 0 || !items.length
    || !items.every(item => item.key && item.name
      && ['service', 'product', 'enterprise'].includes(item.businessType || 'service')
      && Number.isFinite(Number(item.revenueSharePercent)) && Number(item.revenueSharePercent) > 0
      && ((item.businessType || 'service') !== 'product' || item.childProductId))
    || (hasExactAmounts
      ? !weights.every(value => Number.isSafeInteger(value) && value > 0)
      : items.some(item => item.allocationAmountCents != null)
        || Math.abs(items.reduce((sum, item) => sum + Number(item.revenueSharePercent), 0) - 100) > 0.001))
    return null;
  let assigned = 0;
  let exactShares = null;
  if (hasExactAmounts) {
    const total = weights.reduce((sum, value) => sum + BigInt(value), 0n);
    const portions = weights.map((value, index) => {
      const scaled = BigInt(netCents) * BigInt(value);
      return { index, amount: Number(scaled / total), remainder: scaled % total };
    });
    let remainder = netCents - portions.reduce((sum, row) => sum + row.amount, 0);
    for (const row of [...portions].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
      if (remainder-- <= 0) break;
      row.amount += 1;
    }
    exactShares = portions.map(row => row.amount);
  }
  return items.map((item, index) => {
    const amountCents = exactShares ? exactShares[index] : index === items.length - 1 ? netCents - assigned
      : Math.round(netCents * Number(item.revenueSharePercent) / 100);
    assigned += amountCents;
    return { key: item.key, name: item.name, businessType: item.businessType || 'service',
      teamRole: item.teamRole || '', childProductId: item.childProductId || null,
      sharePercent: hasExactAmounts ? weights[index] / weights.reduce((sum, value) => sum + value, 0) * 100 : Number(item.revenueSharePercent), amountCents };
  });
}

module.exports = { allocations };
