const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { partnerBenefitsForMember } = require('../utils/partnerBenefitsForMember');

// GET /api/partner-benefits — 使用 Admin 会员类型节点过滤，旧名称规则只作历史兼容。
router.get('/', auth, async (req, res) => {
  try { res.json({ success: true, data: await partnerBenefitsForMember(req.user) }); }
  catch (error) { res.status(500).json({ success: false, message: '合作伙伴权益加载失败' }); }
});

module.exports = router;
