function plain(value) { return value?.toObject?.() || value || null; }

function snapshot(product, specificationLabel) {
  if (!product) return { performanceRule: null, servicePerformerRoles: [], staffPerformanceOverrides: [] };
  const label = String(specificationLabel || '').trim();
  const price = (product.servicePrices || []).find(row => String(row.label || '').trim() === label);
  const configured = price?.performanceConfig?.enabled === true ? price.performanceConfig : product;
  return {
    performanceRule: plain(configured.performanceRule),
    servicePerformerRoles: (configured.servicePerformerRoles || []).map(plain),
    staffPerformanceOverrides: (configured.staffPerformanceOverrides || []).map(plain),
  };
}

module.exports = { snapshot };
