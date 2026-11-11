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

const oid = () => new mongoose.Types.ObjectId();
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('offline payment, refunds and annual renewal gate produce audited partner commissions',
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
      outsiderId = oid(), patientId = oid(), productId = oid();
    await mongoose.connection.db.collection('tenants').insertMany([
      { _id: tenantId, code: 'jiayihui', status: 'active', name: '测试机构' },
      { _id: otherTenantId, code: 'other', status: 'active', name: '其他机构', serviceScope: ['admin'] },
    ]);
    await mongoose.connection.db.collection('admins').insertMany([
      { _id: clerkId, tenantId, username: 'partner-clerk', name: '登记者', password: 'unused', role: 'superadmin' },
      { _id: reviewerId, tenantId, username: 'partner-reviewer', name: '复核者', password: 'unused', role: 'superadmin' },
      { _id: outsiderId, tenantId: otherTenantId, username: 'partner-outsider', name: '异机构', password: 'unused', role: 'superadmin' },
    ]);
    await mongoose.connection.db.collection('users').insertOne({ _id: patientId, tenantId, name: '合成客户' });
    await mongoose.connection.db.collection('products').insertOne({ _id: productId, tenantId,
      name: '单次线下服务', category: 'health', status: 'on', paymentChannel: 'offline',
      originalPrice: 100, fulfillmentType: 'offline_service', stockLimited: false });
    process.env.JWT_SECRET = 'isolated-market-partner-flow-secret';
    process.env.MARKET_PARTNER_ENABLED = 'true';
    const app = express();
    app.use(express.json());
    app.use('/api/admin/market-partners', require('../src/routes/marketPartnersAdmin'));
    app.use('/api/admin', require('../src/routes/admin'));
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
    await mongoose.connection.db.collection('annualserviceperiods').insertOne({
      patientId, annualPlanId: oid(), sourceType: 'offline_contract',
      contractReference: 'ANNUAL-CONTRACT-002', startDate: '2027-01-01', endDate: '2027-12-31',
      evidenceSnapshot: { test: true }, confirmedBy: reviewerId, confirmedAt: new Date(),
    });
    const recalculated = await call(reviewerId, 'POST',
      `${prefix}/customer-histories/${history.body.data._id}/recalculate`, {});
    assert.equal(recalculated.status, 200, JSON.stringify(recalculated.body));
    const yearTwo = await Commission.findOne({ orderId: secondAnnualId }).lean();
    assert.equal(yearTwo.periodNumber, 2);
    assert.equal(yearTwo.accruedCents, 1000);
  });
