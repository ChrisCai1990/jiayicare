const newModelPaths = [
  '../models/MarketPartner', '../models/MarketPartnerRule',
  '../models/MarketPartnerAttribution', '../models/MarketPartnerCommission',
  '../models/MarketPartnerAudit', '../models/MarketPartnerReceipt',
  '../models/MarketPartnerVerificationCode', '../models/MarketPartnerLoss',
  '../models/MarketPartnerCustomerHistory', '../models/MarketPartnerLeadEvent',
  '../models/TeamIncentiveRule', '../models/TeamIncentive',
];

function requiredDefinitions() {
  const definitions = newModelPaths.flatMap(path => {
    const model = require(path);
    return model.schema.indexes().map(([key, options]) => ({ model, key, options }));
  });
  for (const path of ['../models/Order', '../models/Refund']) {
    const model = require(path);
    const field = path.endsWith('Order') ? 'marketPartnerContractReference' : 'marketPartnerOfflineReference';
    const match = model.schema.indexes().find(([key]) => Object.hasOwn(key, field));
    if (!match) throw new Error(`缺少 ${model.modelName}.${field} 唯一索引定义`);
    definitions.push({ model, key: match[0], options: match[1] });
  }
  return definitions;
}

function sameIndex(actual, expected) {
  return JSON.stringify(actual.key) === JSON.stringify(expected.key)
    && Boolean(actual.unique) === Boolean(expected.options.unique)
    && JSON.stringify(actual.partialFilterExpression || null)
      === JSON.stringify(expected.options.partialFilterExpression || null)
    && (actual.expireAfterSeconds ?? null) === (expected.options.expireAfterSeconds ?? null);
}

async function existingIndexes(model) {
  try { return await model.collection.indexes(); }
  catch (error) {
    if (error.code === 26 || error.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

async function auditMarketPartnerIndexes({ apply = false } = {}) {
  const byModel = new Map();
  for (const definition of requiredDefinitions()) {
    const { model, key, options } = definition;
    if (!byModel.has(model.modelName)) byModel.set(model.modelName, await existingIndexes(model));
    const current = byModel.get(model.modelName);
    if (current.some(index => sameIndex(index, definition))) continue;
    if (apply) {
      await model.collection.createIndex(key, options);
      current.push(...(await existingIndexes(model)).filter(index => !current.some(old => old.name === index.name)));
    } else {
      const name = Object.entries(key).map(([field, direction]) => `${field}_${direction}`).join('_');
      if (!byModel.missing) byModel.missing = [];
      byModel.missing.push(`${model.collection.name}.${name}`);
    }
  }
  return byModel.missing || [];
}

module.exports = { requiredDefinitions, sameIndex, auditMarketPartnerIndexes };
