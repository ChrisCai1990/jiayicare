const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const MarketPartner = require('../models/MarketPartner');
const MarketPartnerVerificationCode = require('../models/MarketPartnerVerificationCode');
const MarketPartnerRule = require('../models/MarketPartnerRule');
const MarketPartnerCommission = require('../models/MarketPartnerCommission');
const Order = require('../models/Order');
const Product = require('../models/Product');
const ServicePackage = require('../models/ServicePackage');
const { checkSmsRateLimit, recordSmsAttempt } = require('../utils/smsRateLimiter');

router.use((req, res, next) => process.env.MARKET_PARTNER_ENABLED === 'true'
  ? next() : res.status(404).json({ success: false, message: '合伙人服务暂未开放' }));
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store, private'); next(); });

const hashCode = (partnerId, code) => crypto.createHmac('sha256', process.env.JWT_SECRET)
  .update(`${partnerId}:${code}`).digest('hex');
const maskedName = name => {
  const value = String(name || '客户');
  return value.length <= 1 ? value : `${value.slice(0, 1)}${'*'.repeat(Math.min(3, value.length - 1))}`;
};

router.post('/send-code', async (req, res) => {
  const referralCode = String(req.body?.referralCode || '').trim().toUpperCase();
  const phone = String(req.body?.phone || '').trim();
  if (!/^[A-F0-9]{12}$/.test(referralCode) || !/^1[3-9]\d{9}$/.test(phone))
    return res.status(400).json({ success: false, message: '请核对推荐码和手机号' });
  const limit = checkSmsRateLimit(phone, req.ip);
  if (!limit.allowed) return res.status(429).json({ success: false, message: limit.message });
  recordSmsAttempt(phone, req.ip);
  const partner = await MarketPartner.findOne({ referralCode, phone, status: 'active' }).select('_id').lean();
  if (!partner) return res.status(404).json({ success: false, message: '未找到已开通的合伙人账号' });
  const code = String(crypto.randomInt(100000, 1000000));
  await MarketPartnerVerificationCode.findOneAndUpdate({ partnerId: partner._id },
    { $set: { codeHash: hashCode(partner._id, code), expiresAt: new Date(Date.now() + 300000), attempts: 0 } },
    { upsert: true });
  try { await require('../utils/marketPartnerSms').sendCode(phone, code); }
  catch (err) {
    await MarketPartnerVerificationCode.deleteOne({ partnerId: partner._id });
    return res.status(503).json({ success: false, message: '短信暂时无法发送，请稍后再试' });
  }
  res.json({ success: true, message: '验证码已发送' });
});

router.post('/login', async (req, res) => {
  const referralCode = String(req.body?.referralCode || '').trim().toUpperCase();
  const phone = String(req.body?.phone || '').trim();
  const code = String(req.body?.code || '').trim();
  if (!/^[A-F0-9]{12}$/.test(referralCode) || !/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code))
    return res.status(400).json({ success: false, message: '登录信息不完整' });
  const partner = await MarketPartner.findOne({ referralCode, phone, status: 'active' }).lean();
  if (!partner) return res.status(401).json({ success: false, message: '验证码或账号无效' });
  const row = await MarketPartnerVerificationCode.findOne({ partnerId: partner._id,
    expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } });
  const expected = row?.codeHash && Buffer.from(row.codeHash, 'hex');
  const actual = Buffer.from(hashCode(partner._id, code), 'hex');
  if (!expected || !crypto.timingSafeEqual(expected, actual)) {
    if (row) await MarketPartnerVerificationCode.updateOne({ _id: row._id }, { $inc: { attempts: 1 } });
    return res.status(401).json({ success: false, message: '验证码或账号无效' });
  }
  const consumed = await MarketPartnerVerificationCode.deleteOne({ _id: row._id, codeHash: row.codeHash });
  if (!consumed.deletedCount) return res.status(401).json({ success: false, message: '验证码已使用' });
  const token = jwt.sign({ type: 'marketPartner', id: String(partner._id), tenantId: String(partner.tenantId) },
    process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ success: true, data: { token, name: partner.name,
    segment: partner.segment || null, productLine: partner.productLine } });
});

router.use(async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const claims = jwt.verify(token || '', process.env.JWT_SECRET);
    if (claims.type !== 'marketPartner') throw new Error('invalid token');
    const partner = await MarketPartner.findOne({ _id: claims.id, tenantId: claims.tenantId,
      status: 'active' }).lean();
    if (!partner) throw new Error('inactive partner');
    req.marketPartner = partner;
    next();
  } catch { res.status(401).json({ success: false, message: '请重新登录' }); }
});

router.get('/me', (req, res) => res.json({ success: true, data: { name: req.marketPartner.name,
  productLine: req.marketPartner.productLine, referralCode: req.marketPartner.referralCode } }));

router.get('/products', async (req, res) => {
  const rules = await MarketPartnerRule.find({ tenantId: req.marketPartner.tenantId,
    ...(req.marketPartner.segment ? { partnerId: req.marketPartner._id }
      : { partnerId: null, productLine: req.marketPartner.productLine }),
    status: 'active', disabled: { $ne: true }, effectiveFrom: { $lte: new Date() },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: new Date() } }] })
    .select('productId sourceType firstBasisPoints tierBasisPoints renewalBasisPoints').lean();
  const promotable = rules.filter(rule => rule.firstBasisPoints > 0
    || (rule.tierBasisPoints || []).some(value => value > 0)
    || (rule.renewalBasisPoints || []).some(value => value.basisPoints > 0));
  const products = await Product.find({ _id: { $in: promotable.filter(row => row.sourceType !== 'servicePackage').map(row => row.productId) },
    status: 'on', paymentChannel: { $ne: 'offline' } })
    .select('name').lean();
  const packages = await ServicePackage.find({ _id: { $in: promotable.filter(row => row.sourceType === 'servicePackage').map(row => row.productId) },
    active: true, 'activation.enabled': true, 'activation.durationMonths': 12,
    'configuration.membershipTier': 'consumer365', 'configuration.includes365': true })
    .select('name').lean();
  res.json({ success: true, data: [...products, ...packages].map(item => ({ id: String(item._id), name: item.name,
    miniProgramPath: `/pages/services/mall/index?productId=${item._id}&partnerCode=${req.marketPartner.referralCode}` })) });
});

router.get('/commissions', async (req, res) => {
  const rows = await MarketPartnerCommission.find({ tenantId: req.marketPartner.tenantId,
    partnerId: req.marketPartner._id }).sort({ createdAt: -1 }).limit(200)
    .populate('patientId', 'name').populate('orderId', 'orderNo serviceName paidAt paymentStatus refundStatus').lean();
  res.json({ success: true, data: rows.map(row => ({ id: String(row._id),
    customer: maskedName(row.patientId?.name), orderNo: row.orderId?.orderNo || '',
    serviceName: row.orderId?.serviceName || '', paidAt: row.orderId?.paidAt || null,
    paymentStatus: row.orderId?.paymentStatus || '', refundStatus: row.orderId?.refundStatus || '',
    salesMonth: row.salesMonth, periodNumber: row.periodNumber, eligibleCashCents: row.eligibleCashCents,
    basisPoints: row.basisPoints, accruedCents: row.accruedCents, paidCents: row.paidCents,
    recoveredCents: row.recoveredCents || 0,
    status: row.status, firstEligibleAt: row.firstEligibleAt, finalEligibleAt: row.finalEligibleAt })) });
});

router.get('/orders', async (req, res) => {
  const rows = await Order.find({ tenantId: req.marketPartner.tenantId, marketPartnerId: req.marketPartner._id })
    .sort({ createdAt: -1 }).limit(200).select('user orderNo serviceName paidAt paidAmount paymentStatus refundStatus')
    .populate('user', 'name').lean();
  const commissions = await MarketPartnerCommission.find({ tenantId: req.marketPartner.tenantId,
    partnerId: req.marketPartner._id, orderId: { $in: rows.map(row => row._id) } })
    .select('orderId status').lean();
  const commissionStatus = new Map(commissions.map(row => [String(row.orderId), row.status]));
  res.json({ success: true, data: rows.map(row => ({ orderNo: row.orderNo,
    customer: maskedName(row.user?.name), serviceName: row.serviceName, paidAt: row.paidAt,
    paidAmount: row.paidAmount, paymentStatus: row.paymentStatus, refundStatus: row.refundStatus,
    commissionStatus: commissionStatus.get(String(row._id)) || 'awaiting_review' })) });
});

module.exports = router;
