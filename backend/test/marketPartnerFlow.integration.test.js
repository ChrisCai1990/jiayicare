const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { auditMarketPartnerIndexes } = require('../src/utils/marketPartnerIndexes');
const Commission = require('../src/models/MarketPartnerCommission');
const Receipt = require('../src/models/MarketPartnerReceipt');
const TeamIncentive = require('../src/models/TeamIncentive');
const Order = require('../src/models/Order');
const Payment = require('../src/models/Payment');
const Refund = require('../src/models/Refund');

const oid = () => new mongoose.Types.ObjectId();
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('online and offline partner payments, renewals, refunds and team incentives pass isolated flow',
  { skip: !process.env.TEST_MONGOD, timeout: 60000 }, async t => {
    const dbpath = mkdtempSync(path.join(tmpdir(), 'market-partner-flow-'));
    const mongoPort = await freePort();
    const mongod = spawn(process.env.TEST_MONGOD, ['--dbpath', dbpath, '--bind_ip', '127.0.0.1',
      '--port', String(mongoPort)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let server;
    t.after(async () => {
      if (server) await new Promise(resolve => server.close(resolve));
      await mongoose.disconnect();
      mongod.kill();
      await new Promise(resolve => mongod.once('exit', resolve));
      rmSync(dbpath, { recursive: true, force: true });
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Mongo startup timeout')), 30000);
      mongod.once('error', reject);
      mongod.once('exit', code => reject(new Error(`Mongo exited ${code}`)));
      mongod.stdout.on('data', chunk => {
        if (String(chunk).includes('Waiting for connections')) { clearTimeout(timer); resolve(); }
      });
      mongod.stderr.resume();
    });
    const database = `jiayicare_partner_http_${crypto.randomUUID().replaceAll('-', '')}`;
    await mongoose.connect(`mongodb://127.0.0.1:${mongoPort}/${database}`,
      { autoIndex: false, autoCreate: false });
    await auditMarketPartnerIndexes({ apply: true });
    const tenantId = oid(), otherTenantId = oid(), clerkId = oid(), reviewerId = oid(),
      outsiderId = oid(), plannerId = oid(), patientId = oid(), productId = oid();
    await mongoose.connection.db.collection('tenants').insertMany([
      { _id: tenantId, code: 'jiayihui', status: 'active', name: '测试机构' },
      { _id: otherTenantId, code: 'other', status: 'active', name: '其他机构', serviceScope: ['admin'] },
    ]);
    await mongoose.connection.db.collection('admins').insertMany([
      { _id: clerkId, tenantId, username: 'partner-clerk', name: '登记者', password: 'unused', role: 'superadmin' },
      { _id: reviewerId, tenantId, username: 'partner-reviewer', name: '复核者', password: 'unused', role: 'superadmin' },
      { _id: outsiderId, tenantId: otherTenantId, username: 'partner-outsider', name: '异机构', password: 'unused', role: 'superadmin' },
      { _id: plannerId, tenantId, username: 'partner-planner', name: '合成规划师', password: 'unused',
        role: 'healthPlanner', staffStatus: 'active' },
    ]);
    await mongoose.connection.db.collection('users').insertOne({ _id: patientId, tenantId,
      name: '合成客户', onboardingCompleted: true, wechatMpOpenid: 'synthetic-openid',
      assignedHealthPlanner: plannerId });
    await mongoose.connection.db.collection('products').insertOne({ _id: productId, tenantId,
      name: '单次线下服务', category: 'health', status: 'on', paymentChannel: 'offline',
      originalPrice: 100, fulfillmentType: 'offline_service', stockLimited: false });
    process.env.JWT_SECRET = 'isolated-market-partner-flow-secret';
    process.env.MARKET_PARTNER_ENABLED = 'true';
    process.env.HEALTH_MANAGEMENT_ROLLOUT_MODE = 'all';
    const app = express();
    app.use(express.json());
    app.use('/api/admin/market-partners', require('../src/routes/marketPartnersAdmin'));
    app.use('/api/market-partner', require('../src/routes/marketPartnerPortal'));
    app.use('/api/admin', require('../src/routes/admin'));
    app.use('/api/services', require('../src/routes/services'));
    app.use('/api/staff', require('../src/routes/annualServicePeriods'));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (actorId, method, route, body) => {
      const token = jwt.sign({ id: String(actorId), type: 'admin' }, process.env.JWT_SECRET);
      const response = await fetch(base + route, { method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const prefix = '/api/admin/market-partners';
    const initialCatalog = await (await fetch(`${base}/api/services`)).json();
    assert.equal(initialCatalog.data.services.some(service => service.id === String(productId)), false,
      'contract-only products must not appear as purchasable marketplace goods');
    const partner = await call(clerkId, 'POST', prefix, { name: '合成合伙人', phone: '13900000001',
      productLine: 'singleVisit', contractReference: 'PARTNER-CONTRACT-001' });
    assert.equal(partner.status, 201, JSON.stringify(partner.body));
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/${partner.body.data._id}/status`,
      { status: 'active' })).status, 200);
    const rule = await call(clerkId, 'POST', `${prefix}/rules`, { productId: String(productId),
      productLine: 'singleVisit', kind: 'first', firstBasisPoints: 1000,
      effectiveFrom: new Date(Date.now() - 86400000).toISOString() });
    assert.equal(rule.status, 201, JSON.stringify(rule.body));
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/rules/${rule.body.data._id}/publish`, {})).status, 200);
    const order = await call(clerkId, 'POST', `${prefix}/offline-orders`, { productId: String(productId),
      patientId: String(patientId), contractReference: 'OFFLINE-CONTRACT-001',
      partnerCode: partner.body.data.referralCode, priceCents: 10000 });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    const orderId = order.body.data._id;
    assert.equal((await call(clerkId, 'PATCH', `/api/admin/orders/${orderId}/pay`,
      { paymentMethod: 'onsite', paidAmount: 100 })).status, 200);
    assert.equal(await Commission.countDocuments({ orderId }), 0);
    const receipt = await call(clerkId, 'POST', `${prefix}/receipts`, { orderId,
      amountCents: 10000, reference: 'BANK-RECEIPT-001', evidence: '隔离环境合成到账凭据',
      receivedAt: new Date().toISOString() });
    assert.equal(receipt.status, 201, JSON.stringify(receipt.body));
    assert.equal(await Commission.countDocuments({ orderId }), 0);
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/receipts/${receipt.body.data._id}/review`,
      { status: 'approved' })).status, 403);
    assert.equal((await call(outsiderId, 'PATCH', `${prefix}/receipts/${receipt.body.data._id}/review`,
      { status: 'approved' })).status, 404);
    const reviewed = await call(reviewerId, 'PATCH', `${prefix}/receipts/${receipt.body.data._id}/review`,
      { status: 'approved' });
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
    const commission = await Commission.findOne({ orderId }).lean();
    assert.equal(commission.accruedCents, 1000);
    assert.equal(commission.status, 'estimated');
    assert.equal(await Receipt.countDocuments({ orderId, status: 'approved' }), 1);
    assert.equal((await call(reviewerId, 'PATCH', `${prefix}/receipts/${receipt.body.data._id}/review`,
      { status: 'approved' })).status, 404);
    assert.equal(await Commission.countDocuments({ orderId }), 1);
    const foreignList = await call(outsiderId, 'GET', `${prefix}/commissions`);
    assert.equal(foreignList.status, 200);
    assert.equal(foreignList.body.data.total, 0);
    const refund = await call(clerkId, 'POST', `${prefix}/offline-orders/${orderId}/refunds`, {
      amountCents: 5000, reference: 'BANK-REFUND-001', evidence: '隔离环境合成退款凭据',
      reason: '合成部分退款' });
    assert.equal(refund.status, 201, JSON.stringify(refund.body));
    assert.equal((await Commission.findOne({ orderId }).lean()).accruedCents, 1000);
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/offline-refunds/${refund.body.data._id}/confirm`,
      {})).status, 403);
    const confirmed = await call(reviewerId, 'PATCH',
      `${prefix}/offline-refunds/${refund.body.data._id}/confirm`, {});
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const reduced = await Commission.findOne({ orderId }).lean();
    assert.equal(reduced.eligibleCashCents, 5000);
    assert.equal(reduced.accruedCents, 500);
    assert.equal(reduced.ledger.at(-1).amountCents, -500);
    assert.equal(await Commission.countDocuments({ orderId }), 1);
    const finalRefund = await call(clerkId, 'POST', `${prefix}/offline-orders/${orderId}/refunds`, {
      amountCents: 5000, reference: 'BANK-REFUND-002', evidence: '隔离环境合成尾款退款凭据',
      reason: '合成剩余款退款' });
    assert.equal(finalRefund.status, 201, JSON.stringify(finalRefund.body));
    assert.equal((await call(reviewerId, 'PATCH',
      `${prefix}/offline-refunds/${finalRefund.body.data._id}/confirm`, {})).status, 200);
    const cancelled = await Commission.findOne({ orderId }).lean();
    assert.equal(cancelled.eligibleCashCents, 0);
    assert.equal(cancelled.accruedCents, 0);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.ledger.at(-1).amountCents, -500);

    // Annual terms require reviewed historical years; later offline renewals also require
    // a confirmed service period carrying the exact contract number.
    const annualProductId = oid();
    await mongoose.connection.db.collection('products').insertOne({ _id: annualProductId, tenantId,
      name: '年度健康顾问', category: 'health', status: 'on', paymentChannel: 'offline',
      originalPrice: 100, fulfillmentType: 'subscription_service', stockLimited: false });
    const annualPartner = await call(clerkId, 'POST', prefix, { name: '年度合成合伙人',
      phone: '13900000002', productLine: 'annualAdvisor', contractReference: 'ANNUAL-PARTNER-001' });
    assert.equal(annualPartner.status, 201, JSON.stringify(annualPartner.body));
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/${annualPartner.body.data._id}/status`,
      { status: 'active' })).status, 200);
    const annualRule = await call(clerkId, 'POST', `${prefix}/rules`, {
      productId: String(annualProductId), productLine: 'annualAdvisor', kind: 'annual',
      firstBasisPoints: 2000, renewalBasisPoints: [{ year: 2, basisPoints: 1000 }],
      effectiveFrom: new Date(Date.now() - 86400000).toISOString() });
    assert.equal(annualRule.status, 201, JSON.stringify(annualRule.body));
    assert.equal((await call(clerkId, 'PATCH',
      `${prefix}/rules/${annualRule.body.data._id}/publish`, {})).status, 200);
    const annualOrder = async reference => call(clerkId, 'POST', `${prefix}/offline-orders`, {
      productId: String(annualProductId), patientId: String(patientId),
      partnerCode: annualPartner.body.data.referralCode, contractReference: reference,
      priceCents: 10000 });
    const annualReceipt = async annualOrderId => {
      const paid = await call(clerkId, 'PATCH', `/api/admin/orders/${annualOrderId}/pay`,
        { paymentMethod: 'onsite', paidAmount: 100 });
      assert.equal(paid.status, 200, JSON.stringify(paid.body));
      const receiptRow = await call(clerkId, 'POST', `${prefix}/receipts`, { orderId: annualOrderId,
        amountCents: 10000, reference: `ANNUAL-BANK-${crypto.randomUUID()}`,
        evidence: '隔离环境合成年度到账凭据', receivedAt: new Date().toISOString() });
      assert.equal(receiptRow.status, 201, JSON.stringify(receiptRow.body));
      const approved = await call(reviewerId, 'PATCH',
        `${prefix}/receipts/${receiptRow.body.data._id}/review`, { status: 'approved' });
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
    };
    const firstAnnual = await annualOrder('ANNUAL-CONTRACT-001');
    assert.equal(firstAnnual.status, 201, JSON.stringify(firstAnnual.body));
    const firstAnnualId = firstAnnual.body.data._id;
    const history = await call(clerkId, 'POST', `${prefix}/customer-histories`, {
      orderId: firstAnnualId, priorPaidPeriods: 0, evidence: '合成历史合同核对结果：此前无付费年度' });
    assert.equal(history.status, 201, JSON.stringify(history.body));
    assert.equal((await call(reviewerId, 'PATCH',
      `${prefix}/customer-histories/${history.body.data._id}/review`,
      { status: 'approved' })).status, 200);
    await annualReceipt(firstAnnualId);
    const yearOne = await Commission.findOne({ orderId: firstAnnualId }).lean();
    assert.equal(yearOne.periodNumber, 1);
    assert.equal(yearOne.accruedCents, 2000);
    const secondAnnual = await annualOrder('ANNUAL-CONTRACT-002');
    assert.equal(secondAnnual.status, 201, JSON.stringify(secondAnnual.body));
    const secondAnnualId = secondAnnual.body.data._id;
    await annualReceipt(secondAnnualId);
    assert.equal(await Commission.countDocuments({ orderId: secondAnnualId }), 0);
    const annualPlanId = oid();
    await mongoose.connection.db.collection('annualplans').insertOne({ _id: annualPlanId,
      patientId, year: 2027, continuitySource: { previousPlanId: oid() },
      reviewStatus: 'pending', moduleData: {} });
    const servicePeriod = await call(plannerId, 'POST',
      `/api/staff/annual-plans/${annualPlanId}/service-period`, {
        sourceType: 'offline_contract', contractReference: 'ANNUAL-CONTRACT-002',
        startDate: '2027-01-01', endDate: '2027-12-31', verified: true,
      });
    assert.equal(servicePeriod.status, 200, JSON.stringify(servicePeriod.body));
    assert.equal(servicePeriod.body.data.period.contractReference, 'ANNUAL-CONTRACT-002');
    const yearTwo = await Commission.findOne({ orderId: secondAnnualId }).lean();
    assert.equal(yearTwo.periodNumber, 2);
    assert.equal(yearTwo.accruedCents, 1000);

    const nutritionistId = oid();
    await mongoose.connection.db.collection('admins').insertOne({ _id: nutritionistId, tenantId,
      username: 'partner-nutritionist', name: '合成营养师', password: 'unused', role: 'nutritionist' });
    const teamRule = await call(clerkId, 'POST', `${prefix}/team-rules`, {
      productId: String(annualProductId), role: 'nutritionist', trigger: 'service_completed',
      ruleType: 'percentage', basisPoints: 500,
      effectiveFrom: new Date(Date.now() - 86400000).toISOString() });
    assert.equal(teamRule.status, 201, JSON.stringify(teamRule.body));
    assert.equal((await call(clerkId, 'PATCH',
      `${prefix}/team-rules/${teamRule.body.data._id}/publish`, {})).status, 200);
    const teamInput = { orderId: firstAnnualId, staffId: String(nutritionistId),
      role: 'nutritionist' };
    assert.equal((await call(clerkId, 'POST', `${prefix}/team-incentives`, teamInput)).status, 409);
    await mongoose.connection.db.collection('fulfillments').insertOne({ _id: oid(), order: new mongoose.Types.ObjectId(firstAnnualId),
      status: 'completed', completedAt: new Date() });
    const incentive = await call(clerkId, 'POST', `${prefix}/team-incentives`, teamInput);
    assert.equal(incentive.status, 201, JSON.stringify(incentive.body));
    assert.equal(incentive.body.data.amountCents, 500);
    assert.equal((await call(clerkId, 'POST', `${prefix}/team-incentives`, teamInput)).status, 409);
    assert.equal((await call(clerkId, 'PATCH',
      `${prefix}/team-incentives/${incentive.body.data._id}/confirm`, {})).status, 403);
    assert.equal((await call(reviewerId, 'PATCH',
      `${prefix}/team-incentives/${incentive.body.data._id}/confirm`, {})).status, 200);
    assert.equal((await call(reviewerId, 'PATCH',
      `${prefix}/team-incentives/${incentive.body.data._id}/pay`,
      { paymentReference: 'TEAM-BANK-001' })).status, 409);
    assert.equal((await TeamIncentive.findById(incentive.body.data._id)).status, 'confirmed');
    // Move only the synthetic paid timestamp past the 30-day boundary.
    await mongoose.connection.db.collection('orders').updateOne(
      { _id: new mongoose.Types.ObjectId(firstAnnualId) },
      { $set: { paidAt: new Date(Date.now() - 31 * 86400000) } });
    const teamPaid = await call(reviewerId, 'PATCH',
      `${prefix}/team-incentives/${incentive.body.data._id}/pay`,
      { paymentReference: 'TEAM-BANK-001' });
    assert.equal(teamPaid.status, 200, JSON.stringify(teamPaid.body));
    assert.equal(teamPaid.body.data.paidCents, 500);
    const annualRefund = await call(clerkId, 'POST', `${prefix}/offline-orders/${firstAnnualId}/refunds`, {
      amountCents: 5000, reference: 'ANNUAL-REFUND-001', evidence: '隔离环境合成团队激励退款凭据',
      reason: '合成年度部分退款' });
    assert.equal(annualRefund.status, 201, JSON.stringify(annualRefund.body));
    assert.equal((await call(reviewerId, 'PATCH',
      `${prefix}/offline-refunds/${annualRefund.body.data._id}/confirm`, {})).status, 200);
    const teamDue = await TeamIncentive.findById(incentive.body.data._id).lean();
    assert.equal(teamDue.amountCents, 250);
    assert.equal(teamDue.status, 'reversal_due');
    const recovered = await call(reviewerId, 'PATCH',
      `${prefix}/team-incentives/${incentive.body.data._id}/recover`,
      { amountCents: 250, recoveryReference: 'TEAM-RECOVERY-001' });
    assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
    assert.equal(recovered.body.data.recoveredCents, 250);
    assert.equal(recovered.body.data.status, 'paid');

    const onlineProductId = oid();
    await mongoose.connection.db.collection('products').insertOne({ _id: onlineProductId, tenantId,
      name: '商城单次服务', category: 'health', status: 'on', paymentChannel: 'wechat_pay',
      originalPrice: 100, fulfillmentType: 'digital_content', stockLimited: false });
    const activeCatalog = await (await fetch(`${base}/api/services`)).json();
    assert.equal(activeCatalog.data.services.some(service => service.id === String(onlineProductId)), true);
    assert.equal(activeCatalog.data.services.some(service => service.id === String(annualProductId)), false);
    const onlinePartner = await call(clerkId, 'POST', prefix, { name: '商城合成合伙人',
      phone: '13900000003', productLine: 'onlineSingle', contractReference: 'ONLINE-PARTNER-001' });
    assert.equal(onlinePartner.status, 201, JSON.stringify(onlinePartner.body));
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/${onlinePartner.body.data._id}/status`,
      { status: 'active' })).status, 200);
    const onlineRule = await call(clerkId, 'POST', `${prefix}/rules`, {
      productId: String(onlineProductId), productLine: 'onlineSingle', kind: 'first',
      firstBasisPoints: 1000, effectiveFrom: new Date(Date.now() - 86400000).toISOString() });
    assert.equal(onlineRule.status, 201, JSON.stringify(onlineRule.body));
    assert.equal((await call(clerkId, 'PATCH',
      `${prefix}/rules/${onlineRule.body.data._id}/publish`, {})).status, 200);
    const customerToken = jwt.sign({ id: String(patientId) }, process.env.JWT_SECRET);
    const wrongClaim = await fetch(`${base}/api/services/partner-referrals/claim`, {
      method: 'POST', headers: { authorization: `Bearer ${customerToken}`,
        'content-type': 'application/json' },
      body: JSON.stringify({ productId: String(onlineProductId), partnerCode: '000000000000' }),
    });
    assert.equal(wrongClaim.status, 404);
    const claimResponse = await fetch(`${base}/api/services/partner-referrals/claim`, {
      method: 'POST', headers: { authorization: `Bearer ${customerToken}`,
        'content-type': 'application/json' },
      body: JSON.stringify({ productId: String(onlineProductId),
        partnerCode: onlinePartner.body.data.referralCode }),
    });
    assert.equal(claimResponse.status, 200, await claimResponse.text());
    const match = await require('../src/utils/marketPartnerAttribution').resolveForOrder({
      tenantId, patientId, productId: onlineProductId });
    assert.ok(match);
    const wechatPay = require('../src/utils/wechatPay');
    const originalCreateJsapiPayment = wechatPay.createJsapiPayment;
    wechatPay.createJsapiPayment = async () => ({ prepayId: 'synthetic-prepay', client: { test: true } });
    t.after(() => { wechatPay.createJsapiPayment = originalCreateJsapiPayment; });
    const checkoutResponse = await fetch(`${base}/api/services/order`, {
      method: 'POST', headers: { authorization: `Bearer ${customerToken}`,
        'content-type': 'application/json' },
      body: JSON.stringify({ serviceId: String(onlineProductId), paymentMethod: 'wechat_pay',
        expectedAmount: 100, partnerCode: onlinePartner.body.data.referralCode }),
    });
    const checkout = await checkoutResponse.json();
    assert.equal(checkoutResponse.status, 200, JSON.stringify(checkout));
    const onlineOrderId = new mongoose.Types.ObjectId(checkout.data.orderId);
    const createdOrder = await Order.findById(onlineOrderId);
    assert.equal(String(createdOrder.marketPartnerId), String(match.attribution.partnerId));
    assert.equal(String(createdOrder.marketPartnerRuleId), String(match.rule._id));
    const payment = await Payment.findOne({ order: onlineOrderId });
    const outTradeNo = payment.outTradeNo;
    assert.equal(await Commission.countDocuments({ orderId: onlineOrderId }), 0);
    await require('../src/utils/marketPartnerSettlement').syncOrder(
      await Order.findById(onlineOrderId));
    assert.equal(await Commission.countDocuments({ orderId: onlineOrderId }), 0);
    await require('../src/utils/orderSettlement').confirmPayment({ outTradeNo,
      transactionId: 'SYNTHETIC-TRANSACTION-001', paidAt: new Date(),
      snapshot: { source: 'isolated_test' } });
    assert.equal((await Payment.findById(payment._id)).status, 'succeeded');
    const onlineCommission = await Commission.findOne({ orderId: onlineOrderId }).lean();
    assert.equal(onlineCommission.accruedCents, 1000);
    assert.equal(onlineCommission.eligibleCashCents, 10000);
    await require('../src/utils/orderSettlement').confirmPayment({ outTradeNo,
      transactionId: 'SYNTHETIC-TRANSACTION-001', paidAt: new Date() });
    assert.equal(await Commission.countDocuments({ orderId: onlineOrderId }), 1);
    assert.equal((await Commission.findOne({ orderId: onlineOrderId }).lean()).ledger.length, 1);
    const onlineRefund = await Refund.create({ order: onlineOrderId, user: patientId,
      amount: 50, totalAmount: 100, outRefundNo: 'SYNTHETIC-REFUND-001' });
    await require('../src/utils/orderSettlement').confirmRefund(onlineRefund,
      { source: 'isolated_test' });
    const afterOnlineRefund = await Commission.findOne({ orderId: onlineOrderId }).lean();
    assert.equal(afterOnlineRefund.eligibleCashCents, 5000);
    assert.equal(afterOnlineRefund.accruedCents, 500);
    const remainingRefund = await Refund.create({ order: onlineOrderId, user: patientId,
      amount: 50, totalAmount: 100, outRefundNo: 'SYNTHETIC-REFUND-002' });
    await require('../src/utils/orderSettlement').confirmRefund(remainingRefund,
      { source: 'isolated_test' });
    const afterFullOnlineRefund = await Commission.findOne({ orderId: onlineOrderId }).lean();
    assert.equal(afterFullOnlineRefund.eligibleCashCents, 0);
    assert.equal(afterFullOnlineRefund.accruedCents, 0);
    assert.equal(afterFullOnlineRefund.status, 'cancelled');

    const memberPackageId = oid();
    await mongoose.connection.db.collection('servicepackages').insertOne({ _id: memberPackageId,
      name: '365健康会员', clientBrand: 'jiayiguanjia', active: true,
      activation: { enabled: true, durationMonths: 12, price: 365, originalPrice: 365 },
      configuration: { includes365: true, membershipTier: 'consumer365', deliveryMode: 'digital' } });
    const memberPartner = await call(clerkId, 'POST', prefix, { name: '会员合成合伙人',
      phone: '13900000004', productLine: 'consumer365', contractReference: 'MEMBER-PARTNER-001' });
    assert.equal(memberPartner.status, 201, JSON.stringify(memberPartner.body));
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/${memberPartner.body.data._id}/status`,
      { status: 'active' })).status, 200);
    const eligiblePackages = await call(clerkId, 'GET', `${prefix}/eligible-packages`);
    assert.equal(eligiblePackages.status, 200);
    assert.equal(eligiblePackages.body.data.some(item => item._id === String(memberPackageId)), true);
    const memberRule = await call(clerkId, 'POST', `${prefix}/rules`, {
      productId: String(memberPackageId), sourceType: 'servicePackage', productLine: 'consumer365',
      kind: 'annual', firstBasisPoints: 2000,
      renewalBasisPoints: [{ year: 2, basisPoints: 1000 }, { year: 3, basisPoints: 500 }],
      effectiveFrom: new Date(Date.now() - 86400000).toISOString() });
    assert.equal(memberRule.status, 201, JSON.stringify(memberRule.body));
    assert.equal((await call(clerkId, 'PATCH',
      `${prefix}/rules/${memberRule.body.data._id}/publish`, {})).status, 200);
    const memberPortalToken = jwt.sign({ type: 'marketPartner', id: String(memberPartner.body.data._id),
      tenantId: String(tenantId) }, process.env.JWT_SECRET);
    const memberProducts = await fetch(`${base}/api/market-partner/products`, {
      headers: { authorization: `Bearer ${memberPortalToken}` },
    });
    assert.equal(memberProducts.status, 200);
    const memberLinks = (await memberProducts.json()).data;
    assert.equal(memberLinks.length, 1);
    assert.equal(memberLinks[0].id, String(memberPackageId));
    assert.match(memberLinks[0].miniProgramPath,
      new RegExp(`productId=${memberPackageId}&partnerCode=${memberPartner.body.data.referralCode}$`));
    const memberClaim = await fetch(`${base}/api/services/partner-referrals/claim`, {
      method: 'POST', headers: { authorization: `Bearer ${customerToken}`,
        'content-type': 'application/json' },
      body: JSON.stringify({ productId: String(memberPackageId),
        partnerCode: memberPartner.body.data.referralCode }),
    });
    assert.equal(memberClaim.status, 200, await memberClaim.text());
    const memberCheckout = async () => {
      const response = await fetch(`${base}/api/services/order`, { method: 'POST',
        headers: { authorization: `Bearer ${customerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ serviceId: String(memberPackageId), expectedAmount: 365,
          paymentMethod: 'wechat_pay', partnerCode: memberPartner.body.data.referralCode }) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body.data.orderId;
    };
    const firstMemberOrderId = await memberCheckout();
    const memberHistory = await call(clerkId, 'POST', `${prefix}/customer-histories`, {
      orderId: firstMemberOrderId, priorPaidPeriods: 0,
      evidence: '合成会员购买历史核对结果：此前无付费年度' });
    assert.equal(memberHistory.status, 201, JSON.stringify(memberHistory.body));
    assert.equal((await call(reviewerId, 'PATCH',
      `${prefix}/customer-histories/${memberHistory.body.data._id}/review`,
      { status: 'approved' })).status, 200);
    assert.equal(await Commission.countDocuments({ orderId: firstMemberOrderId }), 0);
    const firstMemberPayment = await Payment.findOne({ order: firstMemberOrderId });
    await require('../src/utils/orderSettlement').confirmPayment({
      outTradeNo: firstMemberPayment.outTradeNo, transactionId: 'SYNTHETIC-MEMBER-001',
      paidAt: new Date() });
    const firstMemberCommission = await Commission.findOne({ orderId: firstMemberOrderId }).lean();
    assert.equal(firstMemberCommission.periodNumber, 1);
    assert.equal(firstMemberCommission.accruedCents, 7300);
    const secondMemberOrderId = await memberCheckout();
    const secondMemberPayment = await Payment.findOne({ order: secondMemberOrderId });
    await require('../src/utils/orderSettlement').confirmPayment({
      outTradeNo: secondMemberPayment.outTradeNo, transactionId: 'SYNTHETIC-MEMBER-002',
      paidAt: new Date(Date.now() + 1000) });
    const secondMemberCommission = await Commission.findOne({ orderId: secondMemberOrderId }).lean();
    assert.equal(secondMemberCommission.periodNumber, 2);
    assert.equal(secondMemberCommission.accruedCents, 3650);
  });
