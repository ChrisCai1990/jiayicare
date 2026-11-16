const CATEGORIES = new Set(['external_service', 'testing', 'materials', 'logistics', 'other_direct']);

function normalizeItems(rows) {
  if (!Array.isArray(rows) || rows.length > 30) throw new Error('成本项目最多 30 项');
  return rows.map(row => {
    const category = String(row?.category || '');
    const name = String(row?.name || '').trim();
    const amountCents = row?.amountCents;
    if (!CATEGORIES.has(category) || !name || name.length > 100
      || !Number.isSafeInteger(amountCents) || amountCents < 0 || amountCents > 1e10)
      throw new Error('成本项目须填写类别、名称和有效金额');
    return { category, name, amountCents };
  });
}

function normalizeProductCostPlan(input, product) {
  if (!input || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
    throw new Error('成本版本无效，请刷新后重试');
  const note = String(input.note || '').trim();
  if (note.length > 500) throw new Error('成本说明最多 500 字');
  if (!Array.isArray(input.scopes) || input.scopes.length > 50) throw new Error('收费规格成本最多 50 项');
  const labels = new Set((product.servicePrices || []).map(row => String(row.label || '').trim()).filter(Boolean));
  const codes = new Set((product.skus || []).map(row => String(row.code || '').trim()).filter(Boolean));
  const used = new Set();
  const scopes = input.scopes.map(row => {
    const scopeType = String(row?.scopeType || '');
    const scopeKey = String(row?.scopeKey || '').trim();
    const identity = `${scopeType}:${scopeKey}`;
    if (!scopeKey || scopeKey.length > 100 || used.has(identity)
      || (scopeType === 'servicePrice' ? !labels.has(scopeKey) : scopeType === 'sku' ? !codes.has(scopeKey) : true))
      throw new Error('收费规格不存在或重复，请先保存产品收费项目');
    used.add(identity);
    return { scopeType, scopeKey, items: normalizeItems(row.items) };
  });
  const defaultItems = normalizeItems(input.defaultItems);
  return { expectedVersion: input.expectedVersion, defaultItems, scopes, note };
}

module.exports = { normalizeProductCostPlan };
