const Admin = require('../models/Admin');
const MarketPartner = require('../models/MarketPartner');
const PartnerTeam = require('../models/PartnerTeam');
const PartnerTeamRelation = require('../models/PartnerTeamRelation');
const PartnerTeamEarning = require('../models/PartnerTeamEarning');
const Order = require('../models/Order');
const { deliveredServiceShares } = require('./partnerTeamEarning');
const { cancellationReason } = require('./commissionLifecycle');

const key = (type, id) => `${type}:${id}`;
const monthRange = month => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('月份格式无效');
  const [year, value] = month.split('-').map(Number);
  const from = new Date(`${month}-01T00:00:00+08:00`);
  const next = new Date(Date.UTC(year, value, 1) - 8 * 3600000);
  return { from, to: next };
};

async function partnerSelfOverview({ tenantId, personType, personId, month }) {
  if (!['staff', 'partner'].includes(personType)) throw new Error('人员类型无效');
  const period = month || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit' }).format(new Date());
  const { from, to } = monthRange(period);
  const [team, parentRelation] = await Promise.all([
    PartnerTeam.findOne({ tenantId, leaderType: personType, leaderId: personId,
      effectiveUntil: null }).lean(),
    PartnerTeamRelation.findOne({ tenantId, memberType: personType, memberId: personId,
      effectiveUntil: null }).lean(),
  ]);
  const relations = team ? await PartnerTeamRelation.find({ tenantId, leaderType: personType,
    leaderId: personId, effectiveUntil: null }).sort({ effectiveFrom: 1 }).lean() : [];
  const people = [{ personType, personId }, ...relations.map(row => ({ personType: row.memberType,
    personId: row.memberId }))];
  const staffIds = people.filter(row => row.personType === 'staff').map(row => row.personId);
  const partnerIds = people.filter(row => row.personType === 'partner').map(row => row.personId);
  const [staff, partners, earnings] = await Promise.all([
    Admin.find({ tenantId, _id: { $in: [...staffIds, ...(parentRelation?.leaderType === 'staff'
      ? [parentRelation.leaderId] : [])] } }).select('_id name').lean(),
    MarketPartner.find({ tenantId, _id: { $in: [...partnerIds, ...(parentRelation?.leaderType === 'partner'
      ? [parentRelation.leaderId] : [])] } }).select('_id name').lean(),
    PartnerTeamEarning.find({ tenantId, leaderType: personType, leaderId: personId,
      createdAt: { $gte: from, $lt: to } }).select('accruedCents paidCents recoveredCents status').lean(),
  ]);
  const names = new Map([...staff.map(row => [key('staff', row._id), row.name]),
    ...partners.map(row => [key('partner', row._id), row.name])]);
  const totals = new Map(people.map(row => [key(row.personType, row.personId),
    { promotionCents: 0, serviceCents: 0 }]));
  const memberRelations = new Map(relations.map(row => [key(row.memberType, row.memberId), row]));
  const add = (type, id, activity, amount, at) => {
    const personKey = key(type, id);
    const entry = totals.get(personKey);
    if (!entry || !amount) return;
    const relation = memberRelations.get(personKey);
    if (relation && (at < relation.effectiveFrom || (relation.effectiveUntil && at >= relation.effectiveUntil))) return;
    entry[activity === 'promotion' ? 'promotionCents' : 'serviceCents'] += amount;
  };
  const sources = [
    ...(partnerIds.length ? [{ marketPartnerId: { $in: partnerIds } }] : []),
    ...(staffIds.length ? [{ referrerId: { $in: staffIds } },
      { 'servicePerformers.staffId': { $in: staffIds } },
      { fulfillerId: { $in: staffIds } }] : []),
  ];
  const cursor = Order.find({ tenantId, paidAt: { $gte: from, $lt: to },
    paidAmount: { $gt: 0 }, paymentStatus: { $in: ['paid', 'refunded'] }, $or: sources })
    .select('_id status tradeStatus paidAt paidAmount refundedAmount paymentStatus refundStatus marketPartnerId referrerId verifiedAt completedAt redemptions totalUnits servicePerformers fulfillerId businessAllocationsSnapshot serviceItemsSnapshot')
    .lean().cursor();
  for await (const order of cursor) {
    if (cancellationReason(order)) continue;
    const netCents = Math.max(0, Math.round((Number(order.paidAmount || 0)
      - Number(order.refundedAmount || 0)) * 100));
    if (!netCents) continue;
    if (order.marketPartnerId) add('partner', order.marketPartnerId, 'promotion', netCents, order.paidAt);
    else if (order.referrerId) add('staff', order.referrerId, 'promotion', netCents, order.paidAt);
    for (const share of deliveredServiceShares(order))
      add('staff', share.staffId, 'service', share.basisCents, share.evidenceAt);
  }
  const self = totals.get(key(personType, personId));
  const members = relations.map(row => ({ personType: row.memberType,
    personId: String(row.memberId), name: names.get(key(row.memberType, row.memberId)) || '已停用人员',
    effectiveFrom: row.effectiveFrom, ...totals.get(key(row.memberType, row.memberId)) }));
  return { month: period, role: team ? 'leader' : parentRelation ? 'member' : 'independent',
    leader: parentRelation ? { personType: parentRelation.leaderType,
      name: names.get(key(parentRelation.leaderType, parentRelation.leaderId)) || '已停用人员' } : null,
    self, members, team: { memberCount: members.length,
      promotionCents: members.reduce((sum, row) => sum + row.promotionCents, 0),
      serviceCents: members.reduce((sum, row) => sum + row.serviceCents, 0) },
    leaderEarnings: { accruedCents: earnings.reduce((sum, row) => sum + row.accruedCents, 0),
      paidCents: earnings.reduce((sum, row) => sum + row.paidCents - row.recoveredCents, 0) } };
}

module.exports = { partnerSelfOverview, monthRange };
