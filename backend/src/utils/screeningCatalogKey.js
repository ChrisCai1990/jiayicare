function resolveActiveScreeningKey(categories, screeningKey) {
  const [l1Id, parentLabel, itemLabel, ...extra] = String(screeningKey || '').split('|');
  if (!l1Id || !parentLabel || !itemLabel || extra.length) return null;
  const cats = Array.isArray(categories) ? categories : [];
  const byId = new Map(cats.map(category => [String(category._id), category]));
  const childCount = new Map();
  cats.forEach(category => {
    if (category.parent) childCount.set(String(category.parent), (childCount.get(String(category.parent)) || 0) + 1);
  });
  const leaves = cats.filter(category => !(childCount.get(String(category._id)) > 0) && category.name === itemLabel);
  for (const leaf of leaves) {
    let current = leaf;
    const chain = [];
    let broken = false;
    while (current.parent) {
      const parent = byId.get(String(current.parent));
      if (!parent) { broken = true; break; }
      chain.unshift(parent);
      current = parent;
    }
    if (broken) continue;
    const root = chain[0] || leaf;
    const directParent = chain.length ? chain[chain.length - 1] : leaf;
    if (String(root._id) !== l1Id || directParent.name !== parentLabel) continue;
    return { value: `${l1Id}|${parentLabel}|${itemLabel}`, l1Id, parentLabel, itemLabel };
  }
  return null;
}

module.exports = { resolveActiveScreeningKey };
