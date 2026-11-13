const IDENTITY_FIELDS = ['name', 'orderName', 'sourceSection', 'bodyPart', 'specimen', 'modality', 'unit', 'sourcePage', 'sourceRowOrder'];

function identityKey(item) {
  return JSON.stringify(IDENTITY_FIELDS.map(field => String(item?.[field] ?? '')));
}

function previousReportItemsFor(nextItems, previousItems) {
  const oldById = new Map();
  const oldByIdentity = new Map();
  const nextIdentityCounts = new Map();
  for (const item of previousItems || []) {
    if (item?.itemId) oldById.set(String(item.itemId), item);
    const key = identityKey(item);
    oldByIdentity.set(key, [...(oldByIdentity.get(key) || []), item]);
  }
  for (const item of nextItems || []) {
    const key = identityKey(item);
    nextIdentityCounts.set(key, (nextIdentityCounts.get(key) || 0) + 1);
  }
  return (nextItems || []).map(item => {
    const byId = item?.itemId && oldById.get(String(item.itemId));
    if (byId) return byId;
    // Hydration creates a new default itemId for legacy rows that lack one in
    // MongoDB, so the GET and PATCH requests can see different transient IDs.
    // Fall back only when the item identity is unique in both arrays.
    const key = identityKey(item);
    const matches = oldByIdentity.get(key) || [];
    return matches.length === 1 && nextIdentityCounts.get(key) === 1 ? matches[0] : undefined;
  });
}

module.exports = { previousReportItemsFor };
