const ARRAY_FIELDS = [
  'targetNeeds', 'suitableFor', 'notSuitableFor', 'requiredQuestions',
  'supportedCities', 'includedItems', 'excludedItems', 'promiseLimits',
  'handoffConditions',
];

const NEXT_ACTIONS = new Set(['inquire', 'book', 'buy', 'handoff']);

function cleanTextList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
}

function normalizeAiProfile(value = {}) {
  const normalized = {
    enabledForRecommendation: value.enabledForRecommendation === true,
    nextAction: NEXT_ACTIONS.has(value.nextAction) ? value.nextAction : 'inquire',
    operatorNotes: String(value.operatorNotes || '').trim(),
  };
  for (const field of ARRAY_FIELDS) normalized[field] = cleanTextList(value[field]);
  return normalized;
}

function getAiProfileGaps(product) {
  const profile = normalizeAiProfile(product?.aiProfile || {});
  const gaps = [];
  if (!profile.targetNeeds.length) gaps.push('缺少目标需求');
  if (!profile.suitableFor.length) gaps.push('缺少适用人群');
  if (!profile.requiredQuestions.length) gaps.push('缺少购买前必问');
  if (!profile.promiseLimits.length) gaps.push('缺少不可承诺事项');
  if (!profile.handoffConditions.length) gaps.push('缺少转人工条件');
  return gaps;
}

function resolveProductPrices(product) {
  const activeSkus = (product?.skus || [])
    .filter(item => item.active !== false && Number.isFinite(Number(item.price)))
    .map(item => ({ code: item.code || '', label: item.label, price: Number(item.price) }));
  if (activeSkus.length) return activeSkus;
  const servicePrices = (product?.servicePrices || [])
    .filter(item => item.label && Number.isFinite(Number(item.price)))
    .map(item => ({ code: '', label: item.label, price: Number(item.price) }));
  if (servicePrices.length) return servicePrices;
  return [{ code: '', label: product?.name || '基础服务', price: Number(product?.originalPrice) || 0 }];
}

function isAiRecommendable(product) {
  return product?.status === 'on'
    && product?.aiProfile?.enabledForRecommendation === true
    && getAiProfileGaps(product).length === 0;
}

function buildAiCatalogEntry(product) {
  const profile = normalizeAiProfile(product?.aiProfile || {});
  return {
    productId: String(product?._id || ''),
    name: product?.name || '',
    category: product?.category || '',
    subtitle: product?.subtitle || '',
    features: cleanTextList(product?.features),
    prices: resolveProductPrices(product),
    fulfillmentType: product?.fulfillmentType || 'offline_service',
    bookingRequired: product?.bookingRequired !== false,
    deliveryRequired: product?.deliveryRequired === true,
    serviceLocation: product?.serviceLocation || '',
    validityDays: Number(product?.validityDays) || 365,
    refundPolicy: product?.refundPolicy || '',
    targetNeeds: profile.targetNeeds,
    suitableFor: profile.suitableFor,
    notSuitableFor: profile.notSuitableFor,
    requiredQuestions: profile.requiredQuestions,
    supportedCities: profile.supportedCities,
    includedItems: profile.includedItems,
    excludedItems: profile.excludedItems,
    promiseLimits: profile.promiseLimits,
    handoffConditions: profile.handoffConditions,
    nextAction: profile.nextAction,
  };
}

module.exports = {
  ARRAY_FIELDS,
  normalizeAiProfile,
  getAiProfileGaps,
  resolveProductPrices,
  isAiRecommendable,
  buildAiCatalogEntry,
};
