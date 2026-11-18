const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const MarketPartner = require('../src/models/MarketPartner');
const MarketPartnerAttribution = require('../src/models/MarketPartnerAttribution');
const Product = require('../src/models/Product');
const ServicePackage = require('../src/models/ServicePackage');
const Order = require('../src/models/Order');

const chain = value => ({ sort() { return this }, limit() { return this }, select() { return this },
  populate() { return this }, lean: async () => value });

test('partner activity stays scoped and joins only orders after the recorded opening', async t => {
  const originals = [MarketPartner, MarketPartnerAttribution, Product, ServicePackage, Order]
    .map(model => ({ model, find: model.find, findOne: model.findOne }));
  const previousFlag = process.env.MARKET_PARTNER_ENABLED;
  const previousSecret = process.env.JWT_SECRET;
  t.after(() => {
    originals.forEach(({ model, find, findOne }) => { model.find = find; model.findOne = findOne });
    if (previousFlag === undefined) delete process.env.MARKET_PARTNER_ENABLED;
    else process.env.MARKET_PARTNER_ENABLED = previousFlag;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  process.env.MARKET_PARTNER_ENABLED = 'true';
  process.env.JWT_SECRET = 'isolated-activity-test';
  const tenantId = new mongoose.Types.ObjectId(), partnerId = new mongoose.Types.ObjectId();
  const patientId = new mongoose.Types.ObjectId(), productId = new mongoose.Types.ObjectId();
  const openedAt = new Date('2026-11-18T01:00:00Z');
  MarketPartner.findOne = query => {
    assert.equal(String(query.tenantId), String(tenantId));
    assert.equal(String(query._id), String(partnerId));
    return chain({ _id: partnerId, tenantId, status: 'active' });
  };
  MarketPartnerAttribution.find = query => {
    assert.equal(String(query.tenantId), String(tenantId));
    assert.equal(String(query.partnerId), String(partnerId));
    assert.equal(query.source, 'code');
    return chain([{ patientId: { _id: patientId, name: '测试客户' }, productId, effectiveAt: openedAt }]);
  };
  Product.find = () => chain([{ _id: productId, name: '测试产品' }]);
  ServicePackage.find = () => chain([]);
  Order.find = query => {
    assert.equal(String(query.tenantId), String(tenantId));
    assert.equal(String(query.marketPartnerId), String(partnerId));
    return chain([
      { user: patientId, serviceId: String(productId), orderNo: 'LATER',
        paymentStatus: 'paid', createdAt: new Date('2026-11-18T02:00:00Z') },
      { user: patientId, serviceId: String(productId), orderNo: 'EARLIER',
        paymentStatus: 'paid', createdAt: new Date('2026-11-17T02:00:00Z') },
    ]);
  };
  const app = express();
  app.use('/api/market-partner', require('../src/routes/marketPartnerPortal'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const token = jwt.sign({ type: 'marketPartner', id: String(partnerId), tenantId: String(tenantId) }, process.env.JWT_SECRET);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/market-partner/activity`,
    { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].customer, '测***');
  assert.equal(body.data[0].orderNo, 'LATER');
  assert.equal(body.data[0].paymentStatus, 'paid');
});
