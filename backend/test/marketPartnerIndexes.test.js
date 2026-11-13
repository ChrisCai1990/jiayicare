const test = require('node:test');
const assert = require('node:assert/strict');
const { requiredDefinitions, sameIndex } = require('../src/utils/marketPartnerIndexes');

test('release index plan includes contract, receipt, payment and recovery uniqueness', () => {
  const definitions = requiredDefinitions();
  const has = (modelName, field) => definitions.some(item => item.model.modelName === modelName
    && Object.hasOwn(item.key, field) && item.options.unique === true);
  for (const [model, field] of [
    ['Order', 'marketPartnerContractReference'], ['MarketPartnerReceipt', 'reference'],
    ['MarketPartnerCommission', 'paymentReferences'], ['MarketPartnerCommission', 'recoveryReferences'],
    ['TeamIncentive', 'paymentReference'], ['Refund', 'marketPartnerOfflineReference'],
  ]) assert.equal(has(model, field), true, `${model}.${field}`);
});

test('index audit rejects a nonunique or differently filtered index', () => {
  const expected = requiredDefinitions().find(item => item.model.modelName === 'MarketPartnerReceipt'
    && Object.hasOwn(item.key, 'reference'));
  assert.equal(sameIndex({ key: expected.key, unique: false }, expected), false);
  assert.equal(sameIndex({ key: expected.key, unique: true }, expected), true);
});
