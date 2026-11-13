const test = require('node:test');
const assert = require('node:assert/strict');
const { monthRange, partnerSelfOverview } = require('../src/utils/partnerSelfOverview');
const Admin = require('../src/models/Admin');
const MarketPartner = require('../src/models/MarketPartner');
const PartnerTeam = require('../src/models/PartnerTeam');
const PartnerTeamRelation = require('../src/models/PartnerTeamRelation');
const PartnerTeamEarning = require('../src/models/PartnerTeamEarning');
const Order = require('../src/models/Order');

test('monthly business range uses Beijing calendar month, including year boundary', () => {
  const { from, to } = monthRange('2026-12');
  assert.equal(from.toISOString(), '2026-11-30T16:00:00.000Z');
  assert.equal(to.toISOString(), '2026-12-31T16:00:00.000Z');
  assert.throws(() => monthRange('2026-13'), /月份格式无效/);
});

test('self view includes only the logged-in leader and current members', async t => {
  const from = new Date('2026-11-01T00:00:00+08:00');
  const relation = { _id: 'relation-1', leaderType: 'partner', leaderId: 'partner-1',
    memberType: 'partner', memberId: 'partner-2', effectiveFrom: from, effectiveUntil: null };
  t.mock.method(PartnerTeam, 'findOne', () => ({ lean: async () => ({ _id: 'team-1' }) }));
  t.mock.method(PartnerTeamRelation, 'findOne', () => ({ lean: async () => null }));
  t.mock.method(PartnerTeamRelation, 'find', () => ({ sort: () => ({ lean: async () => [relation] }) }));
  t.mock.method(Admin, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(MarketPartner, 'find', () => ({ select: () => ({ lean: async () => [
    { _id: 'partner-1', name: '负责人' }, { _id: 'partner-2', name: '成员' },
  ] }) }));
  t.mock.method(PartnerTeamEarning, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  let orderFilter;
  t.mock.method(Order, 'find', filter => {
    orderFilter = filter;
    return { select: () => ({ lean: () => ({ cursor: async function* () {
      yield { _id: 'own', paidAt: new Date('2026-11-10T00:00:00+08:00'),
        paidAmount: 100, paymentStatus: 'paid', marketPartnerId: 'partner-1' };
      yield { _id: 'member', paidAt: new Date('2026-11-11T00:00:00+08:00'),
        paidAmount: 200, paymentStatus: 'paid', marketPartnerId: 'partner-2' };
      yield { _id: 'outsider', paidAt: new Date('2026-11-11T00:00:00+08:00'),
        paidAmount: 900, paymentStatus: 'paid', marketPartnerId: 'partner-3' };
    } }) }) };
  });
  const result = await partnerSelfOverview({ tenantId: 'tenant-1', personType: 'partner',
    personId: 'partner-1', month: '2026-11' });
  assert.deepEqual(orderFilter.$or, [{ marketPartnerId: { $in: ['partner-1', 'partner-2'] } }]);
  assert.equal(result.self.promotionCents, 10000);
  assert.equal(result.team.promotionCents, 20000);
  assert.equal(result.members.length, 1);
  assert.equal(result.members[0].name, '成员');
  assert.equal(JSON.stringify(result).includes('partner-3'), false);
});
