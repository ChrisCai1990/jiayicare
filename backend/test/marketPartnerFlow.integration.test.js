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

test('offline contract, actual payment and two-person receipt review produce one commission',
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
  });
