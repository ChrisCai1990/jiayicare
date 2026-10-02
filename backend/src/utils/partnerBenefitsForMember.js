const MemberType = require('../models/MemberType');
const Partner = require('../models/Partner');
const PartnerBenefit = require('../models/PartnerBenefit');

async function partnerBenefitsForMember(user) {
  const memberType = String(user?.memberType || '');
  const clientBrand = String(user?.clientBrand || 'jiayiguanjia');
  const type = memberType ? await MemberType.findOne({ name: memberType, clientBrand, active: true }).select('_id').lean() : null;
  const partners = await Partner.find({ status: 'on' }).sort({ sortOrder: 1, createdAt: 1 });
  const benefits = await PartnerBenefit.find({ status: 'on' })
    .populate('partner', 'name category logo status')
    .sort({ sortOrder: 1, createdAt: 1 });
  const visible = benefits.filter(benefit => {
    if (!benefit.partner || benefit.partner.status !== 'on') return false;
    const ids = benefit.visibleMemberTypeIds || [];
    if (ids.length) return !!type && ids.some(id => String(id) === String(type._id));
    const legacyNames = benefit.visibleMemberTypes || [];
    return !legacyNames.length || legacyNames.includes(memberType);
  });
  return partners.map(partner => ({
    partner: { id: partner._id, name: partner.name, category: partner.category, logo: partner.logo, description: partner.description },
    benefits: visible.filter(benefit => String(benefit.partner._id) === String(partner._id)).map(benefit => ({
      id: benefit._id, title: benefit.title, subtitle: benefit.subtitle, images: benefit.images,
      description: benefit.description, usageGuide: benefit.usageGuide,
    })),
  })).filter(group => group.benefits.length);
}

module.exports = { partnerBenefitsForMember };
