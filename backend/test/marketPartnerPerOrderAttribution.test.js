const test = require('node:test');
const assert = require('node:assert/strict');
const MarketPartner = require('../src/models/MarketPartner');
const MarketPartnerRule = require('../src/models/MarketPartnerRule');
const MarketPartnerAttribution = require('../src/models/MarketPartnerAttribution');
const { resolveForOrder } = require('../src/utils/marketPartnerAttribution');

test('each-purchase commission needs a referral on the current order', async t => {
  const partner = { _id: 'partner-1', productLine: 'consultation' };
  const rule = { _id: 'rule-1', kind: 'every', productLine: 'consultation',
    firstBasisPoints: 800, tierBasisPoints: [], renewalBasisPoints: [] };
  const prior = { partnerId: partner._id, productId: 'product-1', effectiveAt: new Date() };
  t.mock.method(MarketPartnerAttribution, 'findOne', () => ({ sort: () => ({ lean: async () => prior }) }));
  t.mock.method(MarketPartnerAttribution, 'create', async record => record);
  t.mock.method(MarketPartner, 'findOne', () => ({ select: () => ({ lean: async () => partner }) }));
  t.mock.method(MarketPartnerRule, 'findOne', () => ({ sort: () => ({ lean: async () => rule }) }));

  const base = { tenantId: 'tenant-1', patientId: 'patient-1', productId: 'product-1' };
  assert.equal(await resolveForOrder(base), null,
    'a prior claim does not attribute a later order without a fresh referral');
  const recommended = await resolveForOrder({ ...base, code: 'ABCDEF123456' });
  assert.equal(recommended.attribution.partnerId, partner._id);
  assert.equal(recommended.rule._id, rule._id);
});
