// Return the purchased composition's cash allocation with the rounding remainder
// assigned to the final item, matching the Admin team-revenue report.
function allocations(order, netCents) {
  const items = order.serviceItemsSnapshot || [];
  if (!Number.isSafeInteger(netCents) || netCents < 0 || !items.length
    || !items.every(item => item.key && item.name && Number.isInteger(Number(item.units))
      && Number(item.units) > 0 && Number(item.revenueSharePercent) > 0)
    || Math.abs(items.reduce((sum, item) => sum + Number(item.revenueSharePercent), 0) - 100) > 0.001)
    return null;
  let assigned = 0;
  return items.map((item, index) => {
    const amountCents = index === items.length - 1 ? netCents - assigned
      : Math.round(netCents * Number(item.revenueSharePercent) / 100);
    assigned += amountCents;
    return { key: item.key, name: item.name, childProductId: item.childProductId,
      teamRole: item.teamRole, units: Number(item.units), amountCents };
  });
}

function unitBasis(order, netCents, serviceItemKey, evidenceId) {
  const item = allocations(order, netCents)?.find(row => row.key === serviceItemKey);
  if (!item) return null;
  const redemptions = (order.redemptions || []).filter(row => row.serviceItemKey === serviceItemKey)
    .sort((a, b) => Number(a.sequence) - Number(b.sequence));
  const position = redemptions.findIndex(row => String(row._id) === String(evidenceId));
  if (position < 0 || position >= item.units || redemptions.length > item.units) return null;
  const normal = Math.floor(item.amountCents / item.units);
  return { item, basisCents: position === item.units - 1
    ? item.amountCents - normal * (item.units - 1) : normal };
}

module.exports = { allocations, unitBasis };
