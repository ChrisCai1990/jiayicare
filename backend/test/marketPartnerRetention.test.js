const test = require('node:test');
const assert = require('node:assert/strict');
const { retentionPreview } = require('../src/utils/marketPartnerRetention');

test('retention floor is product-specific and includes all variable costs', () => {
  const result = retentionPreview({ paidCents: 100000, directCostCents: 25000,
    teamIncentiveCents: 5000, partnerCommissionCents: 15000,
    transactionCostCents: 2000, floorBasisPoints: 5000 });
  assert.deepEqual(result, { retainedCents: 53000, retentionBasisPoints: 5300, belowFloor: false });
  assert.equal(retentionPreview({ paidCents: 100000, directCostCents: 30000,
    teamIncentiveCents: 10000, partnerCommissionCents: 20000,
    transactionCostCents: 2000, floorBasisPoints: 5000 }).belowFloor, true);
});

test('retention preview rejects missing or invalid costs', () => {
  assert.throws(() => retentionPreview({ paidCents: 10000, directCostCents: undefined,
    teamIncentiveCents: 0, partnerCommissionCents: 0, transactionCostCents: 0 }), /有效/);
});
