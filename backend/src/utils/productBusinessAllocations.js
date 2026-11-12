// Freeze the selected price item's business attribution, never another price item's.
function snapshot(product, specificationLabel) {
  const label = String(specificationLabel || '').trim();
  const price = (product?.servicePrices || []).find(row => String(row.label || '').trim() === label);
  return (price?.businessAllocations || []).map(row => ({
    key: row.key, name: row.name, businessType: row.businessType || 'service',
    teamRole: row.teamRole, childProductId: row.childProductId || null,
    revenueSharePercent: Number(row.revenueSharePercent),
  }));
}
module.exports = { snapshot };
