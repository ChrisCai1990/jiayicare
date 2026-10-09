const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Payment = require('../models/Payment');
const Coupon = require('../models/Coupon');
const PushRecord = require('../models/PushRecord');
const fund = require('./healthFundPayment');
const { cents, splitCents } = require('./checkoutAmounts');
const { reserveProduct, releaseOrderInventory } = require('./orderInventory');
const { resolveOrderWorkflowAssignee, orderOwnershipFields } = require('./serviceOwnership');
const wechatPay = require('./wechatPay');

function checkoutError(message, status = 409) { return Object.assign(new Error(message), { status }); }

async function quoteGroup(user, items, products, { couponId, useHealthFund, useEnterpriseSharedFund }) {
  if (useEnterpriseSharedFund && Number(useHealthFund) > 0) throw checkoutError('企业共享基金与个人健康基金请择一使用', 400);
  const prices = items.map(item => cents(item.price));
  const total = prices.reduce((sum, value) => sum + value, 0);
  const policy = await fund.getHealthFundPolicy();
  if (couponId && Number(useHealthFund) > 0 && !policy.allowCouponStacking) throw checkoutError('健康基金与抵用券不可同时使用');
  let coupon = null;
  let couponTotal = 0;
  if (couponId) {
    coupon = await Coupon.findOne({ _id: couponId, patientId: user._id, status: 'active' });
    if (!coupon || (coupon.validTo && new Date(coupon.validTo) < new Date())) throw checkoutError('优惠券不可用或已过期');
    if (total < cents(coupon.minSpend || 0)) throw checkoutError(`订单需满 ¥${coupon.minSpend} 才能使用此券`);
    couponTotal = Math.min(total, cents(coupon.type === 'amount' ? coupon.value : total / 100 * (100 - coupon.value) / 100), cents(fund.deductionLimit(policy.couponDeductionType, policy.couponDeductionValue, total / 100)));
  }
  const coupons = splitCents(couponTotal, prices);
  const afterCoupon = prices.map((price, index) => price - coupons[index]);
  let personal = prices.map(() => 0), corporate = prices.map(() => 0), enterprise = null;
  let sharedAccount = null;
  let shared = prices.map(() => 0);
  if (Number(useHealthFund) > 0) {
    if (!(await require('./packageFeatureEntitlements').hasHealthFundAccess(user))) {
      throw checkoutError('健康基金仅限有效的365、年度、疗程或企业会员使用；基础会员可按原价购买服务', 400);
    }
    const afterTotal = total - couponTotal;
    if (afterTotal < cents(policy.minOrderAmount || 0)) throw checkoutError(`订单满 ¥${policy.minOrderAmount} 方可使用健康基金`);
    const requested = Math.min(cents(useHealthFund), afterTotal);
    const personalAvailable = cents(await fund.getPersonalFundAvailable(user));
    const corporateAvailable = cents(await fund.getCorporateFundAvailable(user));
    if (user.enterpriseId && corporateAvailable) enterprise = await require('../models/Enterprise').findById(user.enterpriseId);
    const enterpriseRule = enterprise?.healthFundPaymentRule;
    const capacities = products.map((product, index) => {
      const enterpriseEligible = !user.enterpriseId || (enterprise?.status === 'active' && (!enterpriseRule?.enabled || (
        afterTotal >= cents(enterpriseRule.minOrderAmount || 0) && (!enterpriseRule.eligibleCategories?.length || enterpriseRule.eligibleCategories.includes(product.category))
      )));
      if (!enterpriseEligible || !fund.corporateProductEligible(policy, product._id, product.category, product.healthFundDeduction)) return 0;
      return Math.min(afterCoupon[index], Math.floor(fund.productDeductionLimit(product.healthFundDeduction, afterCoupon[index] / 100) * 100 + 1e-7));
    });
    // 所有健康基金来源共用商品上限；先使用哪类余额只影响流水归属，
    // 不会把“自有”余额绕过商品的 0–20% 设置。
    personal = splitCents(Math.min(requested, personalAvailable, capacities.reduce((s, v) => s + v, 0)), capacities);
    const remainingCapacities = capacities.map((value, index) => Math.max(0, value - personal[index]));
    corporate = splitCents(Math.min(requested - personal.reduce((s, v) => s + v, 0), corporateAvailable, remainingCapacities.reduce((s, v) => s + v, 0)), remainingCapacities);
  }
  if (useEnterpriseSharedFund) {
    const sharedFund = require('./enterpriseSharedFund');
    for (let index = 0; index < products.length; index++) {
      const candidate = await sharedFund.eligibleAccount(user, products[index]._id);
      if (candidate && (!sharedAccount || String(candidate._id) === String(sharedAccount._id))) sharedAccount = candidate;
    }
    if (!sharedAccount) throw checkoutError('企业共享基金当前不可用，请刷新后重试');
    const capacities = products.map((product, index) => sharedAccount.productIds.some(id => String(id) === String(product._id)) ? Math.floor(afterCoupon[index] / 2) : 0);
    shared = splitCents(Math.min(sharedAccount.availableCents, capacities.reduce((a, b) => a + b, 0)), capacities);
    if (!shared.some(Boolean)) throw checkoutError('所选商品暂无可用的企业共享基金');
  }
  const allocations = prices.map((price, index) => ({
    price: price / 100, coupon: coupons[index] / 100, personal: personal[index] / 100, corporate: corporate[index] / 100, shared: shared[index] / 100,
    cash: (afterCoupon[index] - personal[index] - corporate[index] - shared[index]) / 100,
  }));
  const fundUsed = (personal.reduce((s, v) => s + v, 0) + corporate.reduce((s, v) => s + v, 0)) / 100;
  const enterpriseSharedFundUsed = shared.reduce((a, b) => a + b, 0) / 100;
  return { allocations, coupon, enterprise, sharedAccount, summary: { totalPrice: total / 100, couponDiscount: couponTotal / 100, fundUsed, enterpriseSharedFundUsed, finalPrice: (total - couponTotal - cents(fundUsed) - cents(enterpriseSharedFundUsed)) / 100 } };
}

// Kept separate from the released single-item path. Every selected product is
// validated/reserved; exactly one gateway payment owns immutable allocations.
async function createPushGroupCheckout({ record, user, items, options }) {
  const token = new mongoose.Types.ObjectId().toString();
  const lock = await PushRecord.findOneAndUpdate({ _id: record._id, patientId: user._id,
    $or: [{ checkoutLockUntil: null }, { checkoutLockUntil: { $lt: new Date() } }],
  }, { $set: { checkoutLockToken: token, checkoutLockUntil: new Date(Date.now() + 120000) } }, { new: true });
  if (!lock) throw checkoutError('正在创建订单，请勿重复点击');
  try { return await createLocked({ record, user, items, options }); }
  finally { await PushRecord.updateOne({ _id: record._id, checkoutLockToken: token }, { $set: { checkoutLockUntil: null, checkoutLockToken: '' } }); }
}

async function createLocked({ record, user, items, options }) {
  const appPayment = options.paymentScene === 'app';
  if (appPayment) wechatPay.assertAppReady();
  if (items.length > 10 || new Set(items.map(p => String(p.productId))).size !== items.length) throw checkoutError('每次最多合并 10 件不同商品，请重新选择');
  const pending = await Order.findOne({ user: user._id, pushRecordId: record._id, serviceId: { $in: items.map(p => String(p.productId)) }, paymentStatus: 'pending', tradeStatus: { $ne: 'closed' } });
  if (pending) throw checkoutError('这些商品已有待支付订单，请前往“我的订单”继续支付，或取消后重新选择');
  const products = [];
  const assignees = [];
  for (const item of items) {
    const product = await Product.findOne({ _id: item.productId, status: 'on' });
    if (!product) throw checkoutError(`“${item.name}”已下架或调整，请联系健康规划师重新推荐`);
    products.push(product);
    const assignee = await resolveOrderWorkflowAssignee(user._id, item.name);
    if (!assignee) throw checkoutError('当前没有可用的服务负责人，请联系平台处理后再购买');
    assignees.push(assignee);
  }
  const quote = await quoteGroup(user, items, products, options);
  const { finalPrice } = quote.summary;
  const points = splitCents(Math.floor(cents(finalPrice) / 100), quote.allocations.map(row => cents(row.cash)));
  // A changed fund/coupon quote must be shown before the customer authorizes it.
  if (options.expectedAmount != null && cents(options.expectedAmount) !== cents(finalPrice)) {
    return { success: false, code: 'CHECKOUT_QUOTE_CHANGED', message: '抵扣金额已按商品规则重新核算，请确认合计后再次支付', summary: quote.summary };
  }
  if (finalPrice > 0) {
    if (options.paymentMethod !== 'wechat') throw checkoutError('合并付款须使用微信支付', 400);
    if (!appPayment && !user.wechatMpOpenid) throw checkoutError('请先使用微信登录绑定当前小程序账号后再支付', 400);
    if (products.some(p => p.paymentChannel !== 'wechat_pay')) throw checkoutError('所选商品中有商品未配置普通微信支付，请联系客服');
  }
  const outTradeNo = `JY${Date.now()}${new mongoose.Types.ObjectId().toString().slice(-8)}`.slice(0, 32);
  const ids = items.map(() => new mongoose.Types.ObjectId());
  const orders = [];
  const sharedReservations = [];
  const unownedReservations = new Set();
  let payment;
  let gatewayAttempted = false;
  let settlementAttempted = false;
  try {
    for (const [index, product] of products.entries()) {
      const inventory = await reserveProduct(product);
      if (!inventory.available) throw checkoutError(`“${items[index].name}”已售罄，请重新选择`);
      if (inventory.reserved) unownedReservations.add(product._id);
      const allocation = quote.allocations[index];
      if (allocation.shared > 0) {
        const reservation = { _id: ids[index], enterpriseSharedFundId: quote.sharedAccount._id, enterpriseSharedFundAmount: allocation.shared };
        await require('./enterpriseSharedFund').reserve({ account: quote.sharedAccount, orderId: ids[index], userId: user._id, amount: allocation.shared });
        sharedReservations.push(reservation);
      }
      const order = await Order.create({
        _id: ids[index], checkoutGroupId: ids[0], user: user._id, serviceId: String(product._id), serviceName: items[index].name,
        ...(index === 0 ? { checkoutActionLockToken: outTradeNo, checkoutActionLockUntil: new Date(Date.now() + 120000) } : {}),
        servicePrice: allocation.price, orderType: 'product', pushRecordId: record._id, referralSource: 'push', referrerId: record.staffId,
        servicePerformers: (record.servicePerformers || []).filter(sp => sp.role && sp.staffId && (!sp.productId || String(sp.productId) === String(product._id))).map(sp => ({ role: sp.role, staffId: sp.staffId })),
        ...orderOwnershipFields({ supervisorId: assignees[index], initiationSource: 'customer' }),
        orderNo: `${outTradeNo}-${index + 1}`, status: 'pending', tradeStatus: 'awaiting_payment', paymentStatus: 'pending',
        paymentMethod: finalPrice > 0 ? 'wechat' : 'healthFund', paidAmount: 0, paymentExpectedAmount: allocation.cash,
        checkoutPointsAmount: points[index],
        paymentOutTradeNo: outTradeNo, paymentEnvironment: finalPrice > 0 ? 'production' : '', inventoryReserved: inventory.reserved,
        fulfillmentType: product.fulfillmentType || 'offline_service',
        performanceRuleSnapshot: product.performanceRule?.toObject?.() || product.performanceRule || null,
        servicePerformerRolesSnapshot: (product.servicePerformerRoles || []).map(item => item.toObject ? item.toObject() : item),
        serviceWorkflowSnapshot: product.serviceWorkflow?.toObject?.() || product.serviceWorkflow || null,
        specialtyTermsSnapshot: product.specialtyTerms?.toObject?.() || product.specialtyTerms || null,
        couponId: quote.coupon?._id || null, couponDiscount: allocation.coupon,
        healthFundAmount: (cents(allocation.personal) + cents(allocation.corporate)) / 100,
        healthFundBreakdown: { personal: allocation.personal, corporate: allocation.corporate }, healthFundEnterpriseId: quote.enterprise?._id || null,
        enterpriseSharedFundId: allocation.shared > 0 ? quote.sharedAccount._id : null, enterpriseSharedFundAmount: allocation.shared,
      });
      orders.push(order);
      unownedReservations.delete(product._id);
    }
    payment = await Payment.create({ order: ids[0], allocations: orders.map((order, index) => ({ order: order._id, amount: quote.allocations[index].cash })), user: user._id,
      channel: finalPrice > 0 ? 'wechat_pay' : 'health_fund', amount: finalPrice, outTradeNo, tradeType: appPayment ? 'APP' : 'JSAPI', appId: appPayment ? process.env.WECHAT_APP_APPID : '', status: 'created' });
    await Order.updateMany({ _id: { $in: ids } }, { $set: { paymentId: payment._id } });
    if (finalPrice === 0) {
      settlementAttempted = true;
      await require('./orderSettlement').confirmPayment({ outTradeNo, snapshot: { source: 'fund_checkout' } });
      return { success: true, data: { orderId: ids[0], orderIds: ids, paymentStatus: 'paid' }, summary: quote.summary };
    }
    gatewayAttempted = true;
    const prepay = await (appPayment ? wechatPay.createAppPayment : wechatPay.createJsapiPayment)({ description: `${items[0].name}等${items.length}件商品`, outTradeNo, amount: finalPrice, openid: user.wechatMpOpenid, attach: String(ids[0]) });
    payment.prepayId = prepay.prepayId; payment.status = 'processing'; await payment.save();
    return { success: true, data: { orderId: ids[0], orderIds: ids, paymentParams: prepay.client, paymentStatus: 'pending' }, summary: quote.summary };
  } catch (error) {
    // A timeout is not proof that WeChat rejected the order. Keep the group
    // pending so status/cancel can query it; never release potentially-paid stock.
    if (gatewayAttempted || settlementAttempted) {
      if (gatewayAttempted) await Payment.updateOne({ _id: payment._id, status: { $ne: 'succeeded' } }, { $set: { status: 'processing', failureMessage: error.message } });
      throw checkoutError('付款结果待确认，请前往“我的订单”查看或继续支付，勿重复购买', 503);
    }
    if (payment) { payment.status = 'failed'; payment.failureMessage = error.message; await payment.save(); }
    for (const order of orders) {
      order.tradeStatus = 'closed'; order.status = 'cancelled'; order.paymentStatus = 'failed'; await order.save();
      await releaseOrderInventory(order);
    }
    for (const reservation of sharedReservations) await require('./enterpriseSharedFund').release(reservation);
    for (const id of unownedReservations) await Product.updateOne({ _id: id }, { $inc: { stock: 1 } });
    throw error;
  } finally {
    // Prevent retry/cancel racing the initial gateway request while this group
    // is already visible in the order list.
    await Order.updateOne({ _id: ids[0], checkoutActionLockToken: outTradeNo }, { $set: { checkoutActionLockUntil: null, checkoutActionLockToken: '' } });
  }
}

module.exports = { createPushGroupCheckout, quoteGroup };
