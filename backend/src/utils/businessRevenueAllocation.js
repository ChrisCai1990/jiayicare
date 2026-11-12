// Attribute verified net cash once, using the configuration frozen on purchase.
function allocations(order, netCents) {
  const items = order.businessAllocationsSnapshot?.length
    ? order.businessAllocationsSnapshot : order.serviceItemsSnapshot || [];
  if (!Number.isSafeInteger(netCents) || netCents < 0 || !items.length
    || !items.every(item => item.key && item.name
      && ['service', 'product'].includes(item.businessType || 'service')
      && Number.isFinite(Number(item.revenueSharePercent)) && Number(item.revenueSharePercent) > 0
      && ((item.businessType || 'service') !== 'product' || item.childProductId))
    || Math.abs(items.reduce((sum, item) => sum + Number(item.revenueSharePercent), 0) - 100) > 0.001)
    return null;
  let assigned = 0;
  return items.map((item, index) => {
    const amountCents = index === items.length - 1 ? netCents - assigned
      : Math.round(netCents * Number(item.revenueSharePercent) / 100);
    assigned += amountCents;
    return { key: item.key, name: item.name, businessType: item.businessType || 'service',
      teamRole: item.teamRole || '', childProductId: item.childProductId || null,
      sharePercent: Number(item.revenueSharePercent), amountCents };
  });
}

module.exports = { allocations };
