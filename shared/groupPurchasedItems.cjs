// Older checkouts stored one order per unit. Only group rows linked by checkout and SKU.
function groupPurchasedItems(rows, getOrder = row => row) {
  const groups = new Map();
  for (const row of rows) {
    const order = getOrder(row) || {};
    const key = order.checkoutGroupId && order.serviceId
      ? JSON.stringify([String(order.checkoutGroupId), String(order.serviceId), order.specificationLabel || ''])
      : row;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.values());
}

module.exports = { groupPurchasedItems };
