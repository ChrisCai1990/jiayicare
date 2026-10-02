const test = require('node:test');
const assert = require('node:assert/strict');
const MemberType = require('../src/models/MemberType');
const Partner = require('../src/models/Partner');
const PartnerBenefit = require('../src/models/PartnerBenefit');
const { partnerBenefitsForMember } = require('../src/utils/partnerBenefitsForMember');

test('客户端和医护端共用 Admin 会员类型节点筛选合作伙伴权益', async t => {
  t.mock.method(MemberType, 'findOne', query => ({ select: () => ({ lean: async () =>
    query.name === '卓越会员' && query.clientBrand === 'jinyisen' ? { _id: 'type-jys' } : null }) }));
  t.mock.method(Partner, 'find', () => ({ sort: async () => [{ _id: 'partner', name: '合作机构' }] }));
  t.mock.method(PartnerBenefit, 'find', () => ({ populate: () => ({ sort: async () => [
    { _id: 'all', partner: { _id: 'partner', status: 'on' }, title: '通用权益', visibleMemberTypeIds: [], visibleMemberTypes: [] },
    { _id: 'jys', partner: { _id: 'partner', status: 'on' }, title: '卓越权益', visibleMemberTypeIds: ['type-jys'] },
    { _id: 'old', partner: { _id: 'partner', status: 'on' }, title: '历史权益', visibleMemberTypes: ['卓越会员'] },
  ] }) }));
  const match = await partnerBenefitsForMember({ clientBrand: 'jinyisen', memberType: '卓越会员' });
  assert.deepEqual(match[0].benefits.map(item => item.id), ['all', 'jys', 'old']);
  const otherBrand = await partnerBenefitsForMember({ clientBrand: 'jiayiguanjia', memberType: '卓越会员' });
  assert.deepEqual(otherBrand[0].benefits.map(item => item.id), ['all', 'old']);
});
