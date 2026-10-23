const test = require('node:test');
const assert = require('node:assert/strict');

const GiftRecord = require('../src/models/GiftRecord');
const HealthFundTransaction = require('../src/models/HealthFundTransaction');
const { getCorporateFundAvailable, getPersonalFundAvailable, getVitalityFundAvailable } = require('../src/utils/healthFundPayment');

test('vitality remains available when old reward ledger exceeds the actual total', async () => {
  const giftAggregate = GiftRecord.aggregate;
  const fundAggregate = HealthFundTransaction.aggregate;
  GiftRecord.aggregate = async () => [{ total: 100 }];
  HealthFundTransaction.aggregate = async pipeline => {
    const match = pipeline[0].$match;
    if (match.source === 'vitality') return [{ total: 41.67 }];
    if (match.type === 'grant' && match.remark) return [];
    if (match.type === 'grant') return [{ total: 47 }];
    if (match.source === 'enterprise') return [{ total: -41.67 }];
    return [];
  };
  try {
    const user = { _id: 'legacy-user', healthFundBalance: 130.5 };
    const [corporate, vitality, personal] = await Promise.all([
      getCorporateFundAvailable(user), getVitalityFundAvailable(user), getPersonalFundAvailable(user),
    ]);
    assert.equal(vitality, 41.67);
    assert.equal(Math.round(corporate * 100) / 100, 88.83);
    assert.equal(personal, 0);
    assert.equal(Math.round((corporate + vitality + personal) * 100) / 100, 130.5);
  } finally {
    GiftRecord.aggregate = giftAggregate;
    HealthFundTransaction.aggregate = fundAggregate;
  }
});
