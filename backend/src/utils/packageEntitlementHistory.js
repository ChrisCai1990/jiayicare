function historicalUsed(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw Object.assign(new Error(`${label}须填写非负整数`), { statusCode: 400 });
  return value;
}

// Historical counts exclude usage already captured by the new ledger. Both
// components consume the same purchased quota; a shared pool is counted once.
function reconcileHistoricalCounts(entitlement, { poolUsed, productUsed }) {
  if (entitlement.sourceType !== 'effective_service' || entitlement.historyVerified !== false) {
    throw Object.assign(new Error('该权益无需或已经完成历史次数核对'), { statusCode: 409 });
  }
  const rights = JSON.parse(JSON.stringify(entitlement.rights || {}));
  const pools = rights.sharedEntitlementPools || [];
  const products = rights.productEntitlements || [];
  if (!Array.isArray(poolUsed) || poolUsed.length !== pools.length || !Array.isArray(productUsed) || productUsed.length !== products.length) {
    throw Object.assign(new Error('请逐项填写所有历史使用次数'), { statusCode: 400 });
  }
  const records = (entitlement.usageRecords || []).filter(row => row.status !== 'cancelled');
  pools.forEach((pool, index) => {
    const used = historicalUsed(poolUsed[index], pool.name || '共享池');
    const recorded = records.filter(row => row.poolKey === pool.key).length;
    if (used + recorded > Number(pool.count)) throw Object.assign(new Error(`「${pool.name}」历史与新记录合计超过总次数`), { statusCode: 409 });
    pool.remainingCount = Number(pool.count) - used - recorded;
  });
  products.forEach((product, index) => {
    const used = historicalUsed(productUsed[index], product.productName || '服务');
    if (product.poolKey && pools.some(pool => pool.key === product.poolKey)) {
      if (used !== 0) throw Object.assign(new Error('共用次数请只在共享池填写，服务项目填 0'), { statusCode: 400 });
      return;
    }
    if (products.some((other, otherIndex) => otherIndex !== index && !other.poolKey && String(other.productId) === String(product.productId))) {
      throw Object.assign(new Error('同一商品包含多项独立权益，请联系管理员逐项核对'), { statusCode: 409 });
    }
    const recorded = records.filter(row => !row.poolKey && String(row.productId) === String(product.productId)).length;
    if (used + recorded > Number(product.count)) throw Object.assign(new Error(`「${product.productName}」历史与新记录合计超过总次数`), { statusCode: 409 });
    product.remainingCount = Number(product.count) - used - recorded;
  });
  return rights;
}

module.exports = { reconcileHistoricalCounts };
