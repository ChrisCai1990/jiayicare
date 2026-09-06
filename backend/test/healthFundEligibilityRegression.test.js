const test = require('node:test');
const assert = require('node:assert/strict');
const { corporateProductEligible, getCorporateFundAvailable } = require('../src/utils/healthFundPayment');
const GiftRecord = require('../src/models/GiftRecord');
const HealthFundTransaction = require('../src/models/HealthFundTransaction');

test('category restrictions apply to corporate fund without blocking personal fund settlement', () => {
  assert.equal(corporateProductEligible(
    { eligibleCategories: ['体检服务'] },
    'product-1',
    '营养服务',
    { mode: 'inherit' },
  ), false);
});

test('an explicit product rule takes precedence over inherited platform categories', () => {
  assert.equal(corporateProductEligible(
    { eligibleCategories: ['体检服务'] },
    'product-2',
    '营养服务',
    { mode: 'percentage', value: 5 },
  ), true);
});

test('promotion rewards are not reclassified as corporate fund by their remark', async () => {
  const originalGiftAggregate = GiftRecord.aggregate;
  const originalTransactionAggregate = HealthFundTransaction.aggregate;
  const transactionMatches = [];
  GiftRecord.aggregate = async () => [{ total: 580 }];
  HealthFundTransaction.aggregate = async pipeline => {
    transactionMatches.push(pipeline[0].$match);
    return [{ total: 0 }];
  };

  try {
    assert.equal(await getCorporateFundAvailable({ _id: 'user-1', healthFundBalance: 584 }), 580);
    assert.equal(transactionMatches.length, 1);
    assert.equal(transactionMatches[0].source, 'enterprise');
    assert.equal(transactionMatches[0].remark, undefined);
  } finally {
    GiftRecord.aggregate = originalGiftAggregate;
    HealthFundTransaction.aggregate = originalTransactionAggregate;
  }
});
