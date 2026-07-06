const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const Partner = require('../models/Partner');
const PartnerBenefit = require('../models/PartnerBenefit');

// GET /api/partner-benefits — 客户端只读，按当前用户会员等级过滤可见权益
// 权益 visibleMemberTypes 为空数组 = 所有会员可见；否则需包含当前用户的 memberType
router.get('/', auth, async (req, res) => {
  const memberType = req.user.memberType || '';

  const partners = await Partner.find({ status: 'on' }).sort({ sortOrder: 1, createdAt: 1 });
  const benefits = await PartnerBenefit.find({ status: 'on' })
    .populate('partner', 'name category logo status')
    .sort({ sortOrder: 1, createdAt: 1 });

  const visibleBenefits = benefits.filter(b => {
    if (!b.partner || b.partner.status !== 'on') return false; // 合作伙伴本身下架则权益一并隐藏
    if (!b.visibleMemberTypes || b.visibleMemberTypes.length === 0) return true;
    return b.visibleMemberTypes.includes(memberType);
  });

  // 按合作伙伴分组，方便客户端展示
  const grouped = partners
    .map(p => ({
      partner: { id: p._id, name: p.name, category: p.category, logo: p.logo, description: p.description },
      benefits: visibleBenefits
        .filter(b => String(b.partner._id) === String(p._id))
        .map(b => ({
          id: b._id, title: b.title, subtitle: b.subtitle, images: b.images,
          description: b.description, usageGuide: b.usageGuide,
        })),
    }))
    .filter(g => g.benefits.length > 0);

  res.json({ success: true, data: grouped });
});

module.exports = router;
