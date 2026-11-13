function sameStandardCheckupItems(requestedItems, standardItems, orderTypeMeta) {
  if (requestedItems.length !== standardItems.length) return false;
  const counts = new Map();
  const key = item => JSON.stringify([
    item.name,
    String(item.itemId || ''),
    item.category,
    item.itemType,
  ]);
  for (const ci of standardItems) {
    const meta = orderTypeMeta(ci.type);
    const expected = key({ name: ci.name, itemId: ci.id, ...meta });
    counts.set(expected, (counts.get(expected) || 0) + 1);
  }
  for (const item of requestedItems) {
    const actual = key(item);
    const remaining = counts.get(actual) || 0;
    if (!remaining) return false;
    counts.set(actual, remaining - 1);
  }
  return true;
}

module.exports = { sameStandardCheckupItems };
