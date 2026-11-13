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
    await require('../src/models/PartnerTeam').createIndexes();
    await require('../src/models/PartnerTeamRelation').createIndexes();
    await require('../src/models/MarketPartnerLiaison').createIndexes();
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
    app.use('/api/admin/person-commission-rules', require('../src/routes/personCommissionRulesAdmin'));
    app.use('/api/admin/partner-teams', require('../src/routes/partnerTeamsAdmin'));
    app.use('/api/market-partner', require('../src/routes/marketPartnerPortal'));
    app.use('/api/admin', require('../src/routes/admin'));
    app.use('/api/admin', require('../src/routes/settings'));
    app.use('/api/services', require('../src/routes/services'));
    app.use('/api/staff', require('../src/routes/annualServicePeriods'));
    app.use('/api/staff', require('../src/routes/staff'));
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
    const teamLeaderA = oid(), teamLeaderB = oid(), teamMemberA = oid(), teamMemberB = oid();
    await mongoose.connection.db.collection('admins').insertMany([teamLeaderA, teamLeaderB,
      teamMemberA, teamMemberB].map((id, index) => ({ _id: id, tenantId,
      username: `team-person-${index}`, name: `团队人员${index}`, password: 'unused',
      role: 'healthPlanner', staffStatus: 'active' })));
    const teamRoute = '/api/admin/partner-teams';
    assert.equal((await call(clerkId, 'POST', `${teamRoute}/teams`,
      { leaderType: 'staff', leaderId: String(teamLeaderA) })).status, 201);
    assert.equal((await call(clerkId, 'POST', `${teamRoute}/teams`,
      { leaderType: 'staff', leaderId: String(teamLeaderB) })).status, 201);
    assert.equal((await call(clerkId, 'POST', `${teamRoute}/teams`,
      { leaderType: 'staff', leaderId: String(teamLeaderA) })).status, 409);
    const listedTeams = await call(clerkId, 'GET', `${teamRoute}/teams`);
    assert.equal(listedTeams.body.data.length, 2);
    assert.ok(listedTeams.body.data.every(row => row.memberCount === 0));
    for (const memberId of [teamMemberA, teamMemberB]) {
      assert.equal((await call(clerkId, 'POST', `${teamRoute}/relations`, {
        leaderType: 'staff', leaderId: String(teamLeaderA), memberType: 'staff',
        memberId: String(memberId),
      })).status, 201);
    }
    assert.equal((await call(clerkId, 'POST', `${teamRoute}/relations`, {
      leaderType: 'staff', leaderId: String(teamLeaderB), memberType: 'staff',
      memberId: String(teamMemberA),
    })).status, 409);
    assert.equal((await call(clerkId, 'POST', `${teamRoute}/teams`,
      { leaderType: 'staff', leaderId: String(teamMemberA) })).status, 409);
    assert.equal((await call(clerkId, 'POST', `${teamRoute}/relations`, {
      leaderType: 'staff', leaderId: String(teamLeaderA), memberType: 'staff',
      memberId: String(teamLeaderB),
    })).status, 409);
    assert.equal((await call(clerkId, 'POST', `${teamRoute}/teams/${listedTeams.body.data[0]._id}/end`)).status, 200);
    const teamsWithMembers = await call(clerkId, 'GET', `${teamRoute}/teams`);
    assert.equal(teamsWithMembers.body.data.length, 1);
    assert.equal(teamsWithMembers.body.data[0].memberCount, 2);
    const prefix = '/api/admin/market-partners';
    const initialCatalog = await (await fetch(`${base}/api/services`)).json();
    assert.equal(initialCatalog.data.services.some(service => service.id === String(productId)), false,
      'contract-only products must not appear as purchasable marketplace goods');
    await mongoose.connection.db.collection('products').updateOne({ _id: productId },
      { $set: { paymentChannel: 'both' } });
    const dualChannelCatalog = await (await fetch(`${base}/api/services`)).json();
    assert.equal(dualChannelCatalog.data.services.some(service => service.id === String(productId)), true,
      'one product should be visible in the storefront and remain available for offline orders');
    assert.equal((await call(clerkId, 'GET', '/api/admin/service-items')).status, 410);
    assert.equal((await call(clerkId, 'GET', '/api/admin/other-charges')).status, 410);
    const childDoctorId = oid(), childNutritionId = oid();
    await mongoose.connection.db.collection('products').insertMany([
      { _id: childDoctorId, tenantId, name: '顾问子产品', category: 'health', status: 'off', originalPrice: 60 },
      { _id: childNutritionId, tenantId, name: '营养子产品', category: 'health', status: 'off', originalPrice: 40 },
    ]);
    const compositeItems = [
      { key: 'doctor', name: '顾问服务', units: 1, childProductId: String(childDoctorId), teamRole: 'familyDoctor', revenueSharePercent: 60 },
      { key: 'nutrition', name: '营养服务', units: 1, childProductId: String(childNutritionId), teamRole: 'nutritionist', revenueSharePercent: 40 },
    ];
    const pricedProduct = { name: '多收费项目测试', category: 'health', originalPrice: 100, status: 'off',
      servicePrices: [{ label: '体检服务', price: 80, businessAllocations: [
        { key: 'exam', name: '体检服务 · 顾问管理', businessType: 'service', teamRole: 'familyDoctor', revenueSharePercent: 75 },
        { key: 'enterprise', name: '体检服务 · 企业资源', businessType: 'enterprise', teamRole: 'enterpriseResource', revenueSharePercent: 25 }] },
      { label: '陪同服务', price: 20, businessAllocations: [
        { key: 'escort', name: '陪同服务 · 健管管理', businessType: 'service', teamRole: 'healthManager', revenueSharePercent: 100 }],
        performanceConfig: { enabled: true, performanceRule: { ruleType: 'percentage', referrerRate: 4, fulfillerRate: 2 },
          servicePerformerRoles: [{ role: 'healthManager', ruleType: 'percentage', rate: 2 }], staffPerformanceOverrides: [] } }] };
    assert.equal((await call(clerkId, 'POST', '/api/admin/products', { ...pricedProduct,
      servicePrices: [{ ...pricedProduct.servicePrices[0], businessAllocations: [
        { ...pricedProduct.servicePrices[0].businessAllocations[0], revenueSharePercent: 80 },
        pricedProduct.servicePrices[0].businessAllocations[1]] }] })).status, 400);
    const configuredPrices = await call(clerkId, 'POST', '/api/admin/products', pricedProduct);
    assert.equal(configuredPrices.status, 200, JSON.stringify(configuredPrices.body));
    assert.equal(configuredPrices.body.data.servicePrices[1].businessAllocations[0].name, '陪同服务 · 健管管理');
    assert.equal(configuredPrices.body.data.servicePrices[0].businessAllocations[1].businessType, 'enterprise');
    assert.equal(configuredPrices.body.data.servicePrices[1].performanceConfig.performanceRule.referrerRate, 4);
    const commissionPayload = { expectedUpdatedAt: configuredPrices.body.data.updatedAt,
      performanceRule: { ruleType: 'none', referrerRate: 0, fulfillerRate: 0 },
      servicePerformerRoles: [], staffPerformanceOverrides: [], serviceItems: [],
      servicePrices: pricedProduct.servicePrices.map(row => ({ label: row.label,
        performanceConfig: row.performanceConfig || null })) };
    const separateCommission = await call(clerkId, 'PATCH', `/api/admin/products/${configuredPrices.body.data._id}/commission-rules`, commissionPayload);
    assert.equal(separateCommission.status, 200, JSON.stringify(separateCommission.body));
    assert.equal((await call(clerkId, 'PATCH', `/api/admin/products/${configuredPrices.body.data._id}/commission-rules`, {
      ...commissionPayload, expectedUpdatedAt: new Date(new Date(commissionPayload.expectedUpdatedAt).getTime() - 1000).toISOString(),
    })).status, 409);
    const normalProductEdit = await call(clerkId, 'PUT', `/api/admin/products/${configuredPrices.body.data._id}`, {
      name: pricedProduct.name, category: pricedProduct.category, originalPrice: pricedProduct.originalPrice,
      status: 'off', servicePrices: pricedProduct.servicePrices.map(({ performanceConfig, ...row }) => row) });
    assert.equal(normalProductEdit.status, 200, JSON.stringify(normalProductEdit.body));
    assert.equal(normalProductEdit.body.data.servicePrices[1].performanceConfig.performanceRule.referrerRate, 4,
      'ordinary catalog edits must preserve independent commission rules');
    const exactAmounts = [1480000, 100000, 100000, 200000];
    const exactRoles = ['familyDoctor', 'healthManager', 'medicalAssistant', 'enterpriseResource'];
    const exactRows = exactAmounts.map((amount, index) => ({ key: `exact_${index}`, name: `归属${index}`,
      businessType: index === 3 ? 'enterprise' : 'service', teamRole: exactRoles[index],
      allocationAmountCents: amount, revenueSharePercent: amount / 1880000 * 100 }));
    const exactProduct = await call(clerkId, 'POST', '/api/admin/products', { name: '金额精确归属', category: 'health',
      originalPrice: 18800, status: 'off', servicePrices: [{ label: '全程陪伴', price: 18800, businessAllocations: exactRows }] });
    assert.equal(exactProduct.status, 200, JSON.stringify(exactProduct.body));
    assert.deepEqual(require('../src/utils/businessRevenueAllocation').allocations({ businessAllocationsSnapshot:
      require('../src/utils/productBusinessAllocations').snapshot(exactProduct.body.data, '全程陪伴') }, 1880000)
      .map(row => row.amountCents), exactAmounts);
    assert.equal((await call(clerkId, 'POST', '/api/admin/products', { name: '金额不符', category: 'health',
      originalPrice: 18800, status: 'off', servicePrices: [{ label: '全程陪伴', price: 18800,
        businessAllocations: exactRows.map((row, index) => index === 3 ? { ...row, allocationAmountCents: 199998 } : row) }] })).status, 400);
    const deliverySeparateFromRevenue = await call(clerkId, 'POST', '/api/admin/products', {
      name: '交付子项与归属分离', category: 'health', originalPrice: 18800, status: 'off',
      servicePrices: [{ label: '全程陪伴', price: 18800, businessAllocations: exactRows }],
      serviceItems: [{ key: 'followup', name: '随访交付', businessType: 'service', teamRole: 'healthManager',
        units: 12, revenueSharePercent: 0 }],
    });
    assert.equal(deliverySeparateFromRevenue.status, 200, JSON.stringify(deliverySeparateFromRevenue.body));
    assert.equal(deliverySeparateFromRevenue.body.data.serviceItems[0].revenueSharePercent, 0);
    const wholeProduct = await call(clerkId, 'POST', '/api/admin/products', {
      name: '无收费规格的组合服务', category: 'health', originalPrice: 100, status: 'off',
      businessAllocations: [
        { key: 'team', name: '整单 · 健康顾问管理服务', businessType: 'service', teamRole: 'familyDoctor', revenueSharePercent: 60 },
        { key: 'resource', name: '整单 · 企业资源', businessType: 'enterprise', teamRole: 'enterpriseResource', revenueSharePercent: 40 },
      ] });
    assert.equal(wholeProduct.status, 200, JSON.stringify(wholeProduct.body));
    assert.deepEqual(require('../src/utils/productBusinessAllocations').snapshot(wholeProduct.body.data, '').map(row => row.key), ['team', 'resource']);
    const compositePayload = { name: '年度组合测试', category: 'health', originalPrice: 100, status: 'off',
      serviceItems: compositeItems, staffPerformanceOverrides: [{ staffId: String(plannerId), ruleType: 'percentage',
        referrerRate: 4, fulfillerRate: 3 }] };
    const invalidComposite = await call(clerkId, 'POST', '/api/admin/products', {
      ...compositePayload, serviceItems: [{ ...compositeItems[0], revenueSharePercent: 50 }, compositeItems[1]] });
    assert.equal(invalidComposite.status, 400, '组合营收比例必须合计100%');
    const composite = await call(clerkId, 'POST', '/api/admin/products', compositePayload);
    assert.equal(composite.status, 200, JSON.stringify(composite.body));
    const compositeOrder = await Order.create({ tenantId, user: patientId,
      serviceId: String(composite.body.data._id), serviceName: compositePayload.name, orderType: 'product',
      orderNo: 'SYNTHETIC-COMPOSITE-001', paymentStatus: 'paid', paidAt: new Date(), paidAmount: 100.05, refundedAmount: 20,
      serviceItemsSnapshot: compositeItems, staffPerformanceOverridesSnapshot: compositePayload.staffPerformanceOverrides });
    const compositeAccounting = await call(clerkId, 'GET', `${prefix}/order-accounting/${compositeOrder._id}`);
    assert.equal(compositeAccounting.status, 200, JSON.stringify(compositeAccounting.body));
    assert.deepEqual(compositeAccounting.body.data.revenueAllocation.map(item => item.amountCents), [4803, 3202]);
    assert.equal(compositeAccounting.body.data.revenueAllocation[0].teamRole, 'familyDoctor');
    const teamRevenue = await call(clerkId, 'GET', `${prefix}/team-revenue`);
    assert.equal(teamRevenue.status, 200, JSON.stringify(teamRevenue.body));
    assert.deepEqual(teamRevenue.body.data.map(item => item.amountCents), [4803, 3202]);
    const blockedCompositeRule = await call(clerkId, 'POST', `${prefix}/team-rules`, {
      productId: String(composite.body.data._id), role: 'nutritionist', trigger: 'service_completed',
      ruleType: 'percentage', basisPoints: 500, effectiveFrom: new Date().toISOString() });
    assert.equal(blockedCompositeRule.status, 409, '组合规则不能按整单金额重复配置专项激励');
    assert.equal((await call(clerkId, 'POST', `${prefix}/team-incentives`, {
      orderId: String(compositeOrder._id), staffId: String(plannerId), role: 'nutritionist',
    })).status, 409, '组合订单不能按整单净额给单个人员计提');
    const compositeDoctorId = oid(), otherCompositeDoctorId = oid(), compositeNutritionistId = oid();
    const doctorEvidenceId = oid(), nutritionEvidenceId = oid();
    await mongoose.connection.db.collection('admins').insertMany([
      { _id: compositeDoctorId, tenantId, username: 'composite-doctor', name: '组合顾问', password: 'unused', role: 'familyDoctor' },
      { _id: otherCompositeDoctorId, tenantId, username: 'other-composite-doctor', name: '另一组合顾问', password: 'unused', role: 'familyDoctor' },
      { _id: compositeNutritionistId, tenantId, username: 'composite-nutritionist', name: '组合营养师', password: 'unused', role: 'nutritionist' },
    ]);
    await Order.collection.updateOne({ _id: compositeOrder._id }, { $set: {
      paymentMethod: 'wechat', redemptions: [
        { _id: doctorEvidenceId, sequence: 1, serviceItemKey: 'doctor', redeemedBy: compositeDoctorId, redeemedAt: new Date() },
        { _id: nutritionEvidenceId, sequence: 2, serviceItemKey: 'nutrition', redeemedBy: compositeNutritionistId, redeemedAt: new Date() },
      ],
    } });
    await Payment.collection.insertOne({ _id: oid(), order: compositeOrder._id, user: patientId,
      channel: 'wechat_pay', status: 'succeeded', amount: 100.05,
      outTradeNo: 'COMPOSITE-PAID-001', paidAt: new Date() });
    await Refund.collection.insertOne({ _id: oid(), order: compositeOrder._id, user: patientId,
      status: 'succeeded', amount: 20, totalAmount: 100.05,
      outRefundNo: 'COMPOSITE-REFUND-001', succeededAt: new Date() });
    for (const [childId, role] of [[childDoctorId, 'familyDoctor'], [childNutritionId, 'nutritionist']]) {
      const childRule = await call(clerkId, 'POST', `${prefix}/team-rules`, {
        productId: String(childId), role, trigger: 'service_completed', ruleType: 'percentage',
        basisPoints: 500, effectiveFrom: new Date(Date.now() - 86400000).toISOString() });
      assert.equal(childRule.status, 201, JSON.stringify(childRule.body));
      assert.equal((await call(clerkId, 'PATCH', `${prefix}/team-rules/${childRule.body.data._id}/publish`, {})).status, 200);
    }
    const compositeDoctorIncentive = await call(clerkId, 'POST', `${prefix}/team-incentives`, {
      orderId: String(compositeOrder._id), staffId: String(compositeDoctorId), role: 'familyDoctor',
      serviceItemKey: 'doctor', serviceEvidenceId: String(doctorEvidenceId), note: '顾问子项完成' });
    assert.equal(compositeDoctorIncentive.status, 201, JSON.stringify(compositeDoctorIncentive.body));
    assert.equal(compositeDoctorIncentive.body.data.basisCents, 4803);
    assert.equal(compositeDoctorIncentive.body.data.amountCents, 240);
    assert.equal((await call(clerkId, 'POST', `${prefix}/team-incentives`, {
      orderId: String(compositeOrder._id), staffId: String(otherCompositeDoctorId), role: 'familyDoctor',
      serviceItemKey: 'doctor', serviceEvidenceId: String(doctorEvidenceId), note: '重复认领同一子项',
    })).status, 409, '同一子项核销不能发给第二人');
    const compositeNutritionIncentive = await call(clerkId, 'POST', `${prefix}/team-incentives`, {
      orderId: String(compositeOrder._id), staffId: String(compositeNutritionistId), role: 'nutritionist',
      serviceItemKey: 'nutrition', serviceEvidenceId: String(nutritionEvidenceId), note: '营养子项完成' });
    assert.equal(compositeNutritionIncentive.status, 201, JSON.stringify(compositeNutritionIncentive.body));
    assert.equal(compositeNutritionIncentive.body.data.basisCents, 3202);
    assert.equal(compositeNutritionIncentive.body.data.amountCents, 160);
    assert.equal((await call(reviewerId, 'PATCH',
      `${prefix}/team-incentives/${compositeDoctorIncentive.body.data._id}/confirm`, {})).status, 200);
    await Refund.collection.insertOne({ _id: oid(), order: compositeOrder._id, user: patientId,
      status: 'succeeded', amount: 20, totalAmount: 100.05,
      outRefundNo: 'COMPOSITE-REFUND-002', succeededAt: new Date() });
    await Order.collection.updateOne({ _id: compositeOrder._id }, { $set: { refundedAmount: 40 } });
    await require('../src/utils/teamIncentiveSettlement').syncOrder(await Order.findById(compositeOrder._id));
    assert.equal((await TeamIncentive.findById(compositeDoctorIncentive.body.data._id)).amountCents, 180);
    assert.equal((await TeamIncentive.findById(compositeNutritionIncentive.body.data._id)).amountCents, 120);
    const partner = await call(clerkId, 'POST', prefix, { name: '合成合伙人', phone: '13900000001',
      productLine: 'singleVisit', contractReference: 'PARTNER-CONTRACT-001' });
    assert.equal(partner.status, 201, JSON.stringify(partner.body));
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/${partner.body.data._id}/status`,
      { status: 'active' })).status, 200);
    let sentCode = '';
    require('../src/utils/marketPartnerSms').sendCode = async (_phone, code) => { sentCode = code; };
    const portalCall = async (route, body) => {
      const response = await fetch(`${base}/api/market-partner/${route}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await portalCall('send-code', { phone: '13900000001' })).status, 200);
    assert.match(sentCode, /^\d{6}$/);
    assert.equal((await portalCall('login', { phone: '13900000001', code: '000000' })).status, 401);
    const portalLogin = await portalCall('login', { phone: '13900000001', code: sentCode });
    assert.equal(portalLogin.status, 200, JSON.stringify(portalLogin.body));
    assert.ok(portalLogin.body.data.token);
    assert.equal((await portalCall('login', { phone: '13900000001', code: sentCode })).status, 401);
    const duplicatePhoneId = oid();
    await mongoose.connection.db.collection('marketpartners').insertOne({ _id: duplicatePhoneId, tenantId,
      name: '重复手机号合成档案', phone: '13900000001', productLine: 'nutrition', status: 'active',
      referralCode: 'ABCD1234EF56' });
    require('../src/utils/smsRateLimiter').resetSmsRateLimits();
    assert.equal((await portalCall('send-code', { phone: '13900000001' })).status, 409);
    assert.equal((await portalCall('login', { phone: '13900000001', code: sentCode })).status, 409);
    await mongoose.connection.db.collection('marketpartners').deleteOne({ _id: duplicatePhoneId });
    const partnerB = await call(clerkId, 'POST', prefix, { name: '对接合伙人B',
      phone: '13900000071', productLine: 'nutrition', contractReference: 'PARTNER-B' });
    const partnerC = await call(clerkId, 'POST', prefix, { name: '对接合伙人C',
      phone: '13900000072', productLine: 'annual', contractReference: 'PARTNER-C' });
    assert.equal(partnerB.status, 201); assert.equal(partnerC.status, 201);
    for (const partnerId of [partner.body.data._id, partnerB.body.data._id, partnerC.body.data._id]) {
      const assigned = await call(clerkId, 'POST', `${prefix}/liaisons`, {
        partnerId, staffId: String(plannerId) });
      assert.equal(assigned.status, 201, JSON.stringify(assigned.body));
    }
    const liaisons = await call(clerkId, 'GET', `${prefix}/liaisons`);
    assert.equal(liaisons.body.data.length, 3);
    assert.ok(liaisons.body.data.every(row => String(row.staffId._id) === String(plannerId)));
    assert.equal((await call(clerkId, 'POST', `${prefix}/liaisons`, {
      partnerId: partner.body.data._id, staffId: String(teamLeaderA),
    })).status, 409);
    assert.equal((await call(outsiderId, 'GET', `${prefix}/liaisons`)).body.data.length, 0);
    const partnerTeam = await call(clerkId, 'POST', `${teamRoute}/teams`, {
      leaderType: 'partner', leaderId: partner.body.data._id });
    assert.equal(partnerTeam.status, 201, JSON.stringify(partnerTeam.body));
    assert.equal((await call(clerkId, 'GET', `${prefix}/liaisons`)).body.data.length, 3,
      'creating a partner team must not change internal liaison assignments');
    const oldLiaison = liaisons.body.data.find(row => String(row.partnerId._id) === String(partnerB.body.data._id));
    assert.equal((await call(clerkId, 'POST', `${prefix}/liaisons/${oldLiaison._id}/end`,
      { reason: '内部人员交接' })).status, 200);
    assert.equal((await call(clerkId, 'POST', `${prefix}/liaisons`, {
      partnerId: partnerB.body.data._id, staffId: String(teamLeaderA),
    })).status, 201);
    assert.equal((await call(clerkId, 'GET', `${prefix}/liaisons?history=true`)).body.data.length, 4);
    const teamMember = await call(clerkId, 'POST', `${prefix}/team-members`, {
      partnerId: partner.body.data._id, name: '合成拓展成员', phone: '13900000006' });
    assert.equal(teamMember.status, 201, JSON.stringify(teamMember.body));
    assert.equal((await call(clerkId, 'POST', `${prefix}/team-members`, {
      partnerId: partner.body.data._id, name: '重复成员', phone: '13900000006' })).status, 409);
    assert.equal((await call(outsiderId, 'GET', `${prefix}/team-members?partnerId=${partner.body.data._id}`)).status, 404);
    assert.equal((await call(clerkId, 'GET', `${prefix}/team-members?partnerId=${partner.body.data._id}`)).body.data.length, 1);
    const pausedMember = await call(clerkId, 'PATCH', `${prefix}/team-members/${teamMember.body.data._id}`, {
      name: '合成拓展成员', phone: '13900000006', status: 'suspended', reason: '离开团队',
      updatedAt: teamMember.body.data.updatedAt });
    assert.equal(pausedMember.status, 200, JSON.stringify(pausedMember.body));
    assert.equal(pausedMember.body.data.changeHistory.length, 1);
    const rule = await call(clerkId, 'POST', `${prefix}/rules`, { productId: String(productId),
      productLine: 'singleVisit', kind: 'first', firstBasisPoints: 1000,
      effectiveFrom: new Date(Date.now() - 86400000).toISOString() });
    assert.equal(rule.status, 201, JSON.stringify(rule.body));
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/rules/${rule.body.data._id}/publish`, {})).status, 200);
    const promotable = await call(clerkId, 'GET', `${prefix}/${partner.body.data._id}/promotable-products`);
    assert.equal(promotable.status, 200, JSON.stringify(promotable.body));
    assert.equal(promotable.body.data.rows.length, 1);
    assert.equal(promotable.body.data.rows[0].name, '单次线下服务');
    assert.equal(promotable.body.data.rows[0].firstPercent, 10);
    assert.equal(promotable.body.data.rows[0].canPromote, true);
    assert.equal((await call(outsiderId, 'GET', `${prefix}/${partner.body.data._id}/promotable-products`)).status, 404);
    const staffPatientId = oid(), outsiderPatientId = oid(), offlineNutritionistId = oid();
    await mongoose.connection.db.collection('admins').insertOne({ _id: offlineNutritionistId, tenantId,
      username: 'offline-nutritionist', name: '线下营养师', password: 'unused', role: 'nutritionist', staffStatus: 'active' });
    await mongoose.connection.db.collection('users').insertMany([
      { _id: staffPatientId, tenantId, name: '医护线下客户', assignedHealthPlanner: plannerId },
      { _id: outsiderPatientId, tenantId: otherTenantId, name: '异机构客户' },
    ]);
    await mongoose.connection.db.collection('products').updateOne({ _id: productId }, { $set: {
      servicePerformerRoles: [{ role: 'nutritionist', ruleType: 'percentage', rate: 8 }],
      staffPerformanceOverrides: [{ staffId: offlineNutritionistId, ruleType: 'percentage', referrerRate: 0, fulfillerRate: 5 }],
    } });
    const staffContract = 'STAFF-OFFLINE-001';
    const staffPayload = { productId: String(productId), contractReference: staffContract,
      partnerCode: partner.body.data.referralCode, priceCents: 10000,
      servicePerformers: [{ role: 'nutritionist', staffId: String(offlineNutritionistId) }] };
    const staffOrder = await call(plannerId, 'POST', `/api/staff/patients/${staffPatientId}/offline-orders`, staffPayload);
    assert.equal(staffOrder.status, 201, JSON.stringify(staffOrder.body));
    const recorded = await Order.findById(staffOrder.body.data.orderId);
    assert.equal(recorded.paymentStatus, 'unpaid');
    assert.equal(String(recorded.marketPartnerId), String(partner.body.data._id));
    assert.equal(String(recorded.servicePerformers[0].staffId), String(offlineNutritionistId));
    assert.equal(String(recorded.initiatedByStaff), String(plannerId));
    assert.equal(recorded.referrerId, null, '登记人不能自动获得内部推广绩效');
    assert.equal((await call(plannerId, 'POST', `/api/staff/patients/${staffPatientId}/offline-orders`, staffPayload)).status, 409);
    assert.equal((await call(plannerId, 'POST', `/api/staff/patients/${staffPatientId}/offline-orders`,
      { ...staffPayload, contractReference: 'STAFF-OFFLINE-002', priceCents: 9900 })).status, 409);
    assert.equal((await call(plannerId, 'POST', `/api/staff/patients/${staffPatientId}/offline-orders`,
      { ...staffPayload, contractReference: 'STAFF-OFFLINE-ROLE', servicePerformers: [
        { role: 'nutritionist', staffId: String(plannerId) }] })).status, 400);
    const attributedAgain = await call(plannerId, 'POST', `/api/staff/patients/${staffPatientId}/offline-orders`,
      { ...staffPayload, contractReference: 'STAFF-OFFLINE-004', partnerCode: '' });
    assert.equal(attributedAgain.status, 201, JSON.stringify(attributedAgain.body));
    assert.equal(String((await Order.findById(attributedAgain.body.data.orderId)).marketPartnerId),
      String(partner.body.data._id));
    assert.equal((await call(plannerId, 'POST', `/api/staff/patients/${outsiderPatientId}/offline-orders`,
      { ...staffPayload, contractReference: 'STAFF-OFFLINE-003' })).status, 403);
    const sharedCatalogProductId = oid();
    await mongoose.connection.db.collection('products').insertOne({ _id: sharedCatalogProductId, tenantId,
      name: '现有商城服务线下成交', category: 'health', status: 'on', paymentChannel: 'wechat_pay',
      originalPrice: 120, fulfillmentType: 'offline_service', stockLimited: false });
    await Order.create({ tenantId, user: patientId, serviceId: String(sharedCatalogProductId),
      serviceName: '现有商城服务线下成交', orderType: 'product', paymentStatus: 'paid', paidAmount: 120 });
    await Order.create({ tenantId, user: patientId, serviceId: String(sharedCatalogProductId),
      serviceName: '现有商城服务线下成交', orderType: 'product', paymentStatus: 'paid', paidAmount: 120 });
    const paidCatalog = await (await fetch(`${base}/api/services`)).json();
    assert.equal(paidCatalog.data.services.find(item => item.id === String(sharedCatalogProductId)).reviewCount, 1,
      '已购人数按实际付款客户去重，而非未维护的 Product.sales 字段');
    const sharedCatalogOrder = await call(plannerId, 'POST', `/api/staff/patients/${staffPatientId}/offline-orders`, {
      productId: String(sharedCatalogProductId), contractReference: 'STAFF-CATALOG-001', priceCents: 12000 });
    assert.equal(sharedCatalogOrder.status, 201, JSON.stringify(sharedCatalogOrder.body));
    assert.equal((await Order.findById(sharedCatalogOrder.body.data.orderId)).paymentStatus, 'unpaid');
    const automaticReferencePayload = { productId: String(sharedCatalogProductId), priceCents: 12000,
      requestId: crypto.randomUUID() };
    const automaticReferenceOrder = await call(plannerId, 'POST', `/api/staff/patients/${staffPatientId}/offline-orders`, automaticReferencePayload);
    assert.equal(automaticReferenceOrder.status, 201, JSON.stringify(automaticReferenceOrder.body));
    assert.match(automaticReferenceOrder.body.data.businessReference, /^SO[A-F0-9]{24}$/);
    assert.equal((await call(plannerId, 'POST', `/api/staff/patients/${staffPatientId}/offline-orders`,
      automaticReferencePayload)).status, 409);
    await mongoose.connection.db.collection('products').updateOne({ _id: sharedCatalogProductId },
      { $set: { 'serviceWorkflow.key': 'annual_management' } });
    assert.equal((await call(plannerId, 'POST', `/api/staff/patients/${staffPatientId}/offline-orders`, {
      ...automaticReferencePayload, requestId: crypto.randomUUID() })).status, 409,
    '年度组合不能通过单项待收款订单绕过年度权益承接');
    assert.equal((await call(clerkId, 'PATCH', `/api/admin/orders/${recorded._id}/pay`,
      { paymentMethod: 'onsite', paidAmount: 100 })).status, 200);
    const staffReceipt = await call(clerkId, 'POST', `${prefix}/receipts`, { orderId: String(recorded._id),
      amountCents: 10000, reference: 'BANK-STAFF-001', evidence: '隔离环境到账凭据',
      receivedAt: new Date().toISOString() });
    assert.equal(staffReceipt.status, 201, JSON.stringify(staffReceipt.body));
    assert.equal((await call(reviewerId, 'PATCH', `${prefix}/receipts/${staffReceipt.body.data._id}/review`,
      { status: 'approved' })).status, 200);
    assert.equal((await Commission.findOne({ orderId: recorded._id }).lean()).accruedCents, 1000);
    const internalOrder = await Order.findById(recorded._id);
    const verified = await call(clerkId, 'PATCH', `/api/admin/orders/${recorded._id}/verify`,
      { verifyCode: internalOrder.verifyCode });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const staffCommission = await require('../src/models/Commission').findOne({ orderId: recorded._id,
      staffId: offlineNutritionistId, role: 'fulfiller' }).lean();
    assert.equal(staffCommission.commissionAmount, 5, '产品个人服务比例覆盖岗位默认比例');
    const accounting = await call(clerkId, 'GET', `${prefix}/order-accounting/${recorded._id}`);
    assert.equal(accounting.status, 200, JSON.stringify(accounting.body));
    assert.equal(accounting.body.data.cash.netCents, 10000);
    assert.equal(accounting.body.data.partnerCommission[0].accruedCents, 1000);
    assert.equal(accounting.body.data.staffCommissions[0].commissionAmount, 5);
    assert.equal(accounting.body.data.order.servicePerformers[0].staffId.name, '线下营养师');
    assert.equal((await call(outsiderId, 'GET', `${prefix}/order-accounting/${recorded._id}`)).status, 404);
    const order = await call(clerkId, 'POST', `${prefix}/offline-orders`, { productId: String(productId),
      patientId: String(patientId), contractReference: 'OFFLINE-CONTRACT-001',
      partnerCode: partner.body.data.referralCode, priceCents: 10000 });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    const orderId = order.body.data._id;
    await mongoose.connection.db.collection('products').updateOne({ _id: productId }, { $set: { servicePrices: [
      { label: '体检服务', price: 80, businessAllocations: [
        { key: 'exam', name: '顾问管理服务', businessType: 'service', teamRole: 'familyDoctor', revenueSharePercent: 100 }] },
      { label: '陪同服务', price: 20, businessAllocations: [
        { key: 'escort', name: '健管专员管理服务', businessType: 'service', teamRole: 'healthManager', revenueSharePercent: 100 }],
        performanceConfig: { enabled: true, performanceRule: { ruleType: 'percentage', referrerRate: 6, fulfillerRate: 3 },
          servicePerformerRoles: [{ role: 'healthManager', ruleType: 'percentage', rate: 3 }], staffPerformanceOverrides: [] } },
    ] } });
    const specOrder = await call(clerkId, 'POST', `${prefix}/offline-orders`, { productId: String(productId),
      patientId: String(patientId), specificationLabel: '陪同服务', contractReference: 'OFFLINE-SPEC-001',
      partnerCode: partner.body.data.referralCode, priceCents: 2000 });
    assert.equal(specOrder.status, 201, JSON.stringify(specOrder.body));
    assert.equal(specOrder.body.data.servicePrice, 20);
    assert.deepEqual(specOrder.body.data.businessAllocationsSnapshot.map(item => item.key), ['escort']);
    assert.equal(specOrder.body.data.performanceRuleSnapshot.referrerRate, 6);
    assert.deepEqual(specOrder.body.data.servicePerformerRolesSnapshot.map(item => item.role), ['healthManager']);
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
    const partnerBuyerId = oid();
    await mongoose.connection.db.collection('users').insertOne({ _id: partnerBuyerId, tenantId,
      name: '合成合伙人本人', phone: '13900000003', contactPhone: '13900000003',
      onboardingCompleted: true, wechatMpOpenid: 'synthetic-partner-openid',
      assignedHealthPlanner: plannerId });
    await mongoose.connection.db.collection('products').updateOne({ _id: onlineProductId },
      { $set: { partnerSelfPrice: 80 } });
    const partnerBuyerToken = jwt.sign({ id: String(partnerBuyerId) }, process.env.JWT_SECRET);
    const myPromotion = async () => (await (await fetch(`${base}/api/services/my-partner-promotion`,
      { headers: { authorization: `Bearer ${partnerBuyerToken}` } })).json()).data;
    assert.equal((await myPromotion()).selfPurchaseEligible, false);
    await mongoose.connection.db.collection('orders').insertOne({ _id: oid(), tenantId,
      user: patientId, serviceId: String(onlineProductId), serviceName: '合成已完成客户业务',
      marketPartnerId: new mongoose.Types.ObjectId(onlinePartner.body.data._id),
      paymentStatus: 'paid', paidAmount: 100, refundedAmount: 0, refundStatus: 'none',
      paidAt: new Date(Date.now() - 31 * 86400000) });
    const eligiblePromotion = await myPromotion();
    assert.equal(eligiblePromotion.selfPurchaseEligible, true);
    assert.equal(eligiblePromotion.selfPrices.find(row => row.id === String(onlineProductId)).price, 80);
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
    const repeatedProductId = oid();
    await mongoose.connection.db.collection('products').insertOne({ _id: repeatedProductId, tenantId,
      name: '逐笔推荐服务', category: 'health', status: 'on', paymentChannel: 'wechat_pay',
      originalPrice: 100, fulfillmentType: 'digital_content', stockLimited: false });
    const repeatedRule = await call(clerkId, 'POST', `${prefix}/rules`, {
      productId: String(repeatedProductId), productLine: 'onlineSingle', kind: 'every',
      firstBasisPoints: 800, effectiveFrom: new Date(Date.now() - 86400000).toISOString() });
    assert.equal(repeatedRule.status, 201, JSON.stringify(repeatedRule.body));
    assert.equal((await call(clerkId, 'PATCH',
      `${prefix}/rules/${repeatedRule.body.data._id}/publish`, {})).status, 200);
    const attribution = require('../src/utils/marketPartnerAttribution');
    assert.ok(await attribution.claim({ tenantId, patientId, productId: repeatedProductId,
      code: onlinePartner.body.data.referralCode }));
    assert.equal(await attribution.resolveForOrder({ tenantId, patientId,
      productId: repeatedProductId }), null, '旧推荐记录不能让之后自行购买的订单自动归给合伙人');
    const repeatedMatch = await attribution.resolveForOrder({ tenantId, patientId,
      productId: repeatedProductId, code: onlinePartner.body.data.referralCode });
    assert.equal(String(repeatedMatch.attribution.partnerId), String(onlinePartner.body.data._id));
    assert.equal(repeatedMatch.rule.kind, 'every');
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
    const ownClaim = await fetch(`${base}/api/services/partner-referrals/claim`, {
      method: 'POST', headers: { authorization: `Bearer ${partnerBuyerToken}`,
        'content-type': 'application/json' },
      body: JSON.stringify({ productId: String(onlineProductId),
        partnerCode: onlinePartner.body.data.referralCode }),
    });
    assert.equal(ownClaim.status, 404);
    const ownCheckoutResponse = await fetch(`${base}/api/services/order`, {
      method: 'POST', headers: { authorization: `Bearer ${partnerBuyerToken}`,
        'content-type': 'application/json' },
      body: JSON.stringify({ serviceId: String(onlineProductId), paymentMethod: 'wechat_pay',
        expectedAmount: 80, partnerCode: onlinePartner.body.data.referralCode }),
    });
    const ownCheckout = await ownCheckoutResponse.json();
    assert.equal(ownCheckoutResponse.status, 200, JSON.stringify(ownCheckout));
    const ownOrder = await Order.findById(ownCheckout.data.orderId);
    assert.equal(ownOrder.servicePrice, 80);
    assert.equal(ownOrder.partnerSelfPurchaseApplied, true);
    assert.equal(ownOrder.marketPartnerId, null);
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
    const packagePayload = { name: '365健康会员', clientBrand: 'jiayiguanjia', active: true,
      activation: { enabled: true, durationMonths: 12, price: 365, originalPrice: 365 },
      configuration: { includes365: true, membershipTier: 'consumer365', deliveryMode: 'digital',
        businessAllocations: [
          { key: 'advisory', name: '年度管理服务', businessType: 'service',
            teamRole: 'familyDoctor', revenueSharePercent: 60 },
          { key: 'testing', name: '检测产品业务', businessType: 'product',
            teamRole: 'healthManager', childProductId: String(childDoctorId), revenueSharePercent: 40 },
        ] } };
    assert.equal((await call(clerkId, 'PUT', `/api/admin/service-packages/${memberPackageId}`,
      { ...packagePayload, configuration: { ...packagePayload.configuration,
        businessAllocations: packagePayload.configuration.businessAllocations.map((item, index) =>
          index ? { ...item, revenueSharePercent: 30 } : item) } })).status, 400);
    const unnamedPackage = await call(clerkId, 'PUT', `/api/admin/service-packages/${memberPackageId}`,
      { ...packagePayload, configuration: { ...packagePayload.configuration,
        businessAllocations: [{ key: 'medical', name: '', businessType: 'service',
          teamRole: 'medicalAssistant', revenueSharePercent: 100 }] } });
    assert.equal(unnamedPackage.status, 200, JSON.stringify(unnamedPackage.body));
    assert.equal(unnamedPackage.body.data.configuration.businessAllocations[0].name, '就医专员管理服务');
    const resourcePackage = await call(clerkId, 'PUT', `/api/admin/service-packages/${memberPackageId}`,
      { ...packagePayload, configuration: { ...packagePayload.configuration,
        businessAllocations: [{ key: 'enterprise', name: '', businessType: 'enterprise',
          teamRole: 'enterpriseResource', revenueSharePercent: 100 }] } });
    assert.equal(resourcePackage.status, 200, JSON.stringify(resourcePackage.body));
    assert.equal(resourcePackage.body.data.configuration.businessAllocations[0].name, '企业资源');
    const configuredPackage = await call(clerkId, 'PUT', `/api/admin/service-packages/${memberPackageId}`,
      packagePayload);
    assert.equal(configuredPackage.status, 200, JSON.stringify(configuredPackage.body));
    const listCustomerPackages = async () => {
      const response = await fetch(`${base}/api/services/packages`, {
        headers: { authorization: `Bearer ${customerToken}` },
      });
      assert.equal(response.status, 200);
      return (await response.json()).data;
    };
    assert.equal((await listCustomerPackages()).find(item => item.id === String(memberPackageId)).canJoin365, true);
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
    assert.deepEqual((await Order.findById(firstMemberOrderId).lean()).businessAllocationsSnapshot
      .map(item => item.businessType), ['service', 'product']);
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
    const packageAccounting = await call(clerkId, 'GET', `${prefix}/order-accounting/${firstMemberOrderId}`);
    assert.equal(packageAccounting.status, 200, JSON.stringify(packageAccounting.body));
    assert.deepEqual(packageAccounting.body.data.revenueAllocation.map(item => item.amountCents), [21900, 14600]);
    assert.deepEqual(packageAccounting.body.data.revenueAllocation.map(item => item.businessType), ['service', 'product']);
    const packageRevenue = await call(clerkId, 'GET', `${prefix}/team-revenue`);
    assert.equal(packageRevenue.status, 200, JSON.stringify(packageRevenue.body));
    assert.deepEqual(packageRevenue.body.data.filter(item => ['advisory', 'testing'].includes(item.serviceItemKey))
      .map(item => [item.businessType, item.amountCents]), [['service', 21900], ['product', 14600]]);
    assert.equal((await listCustomerPackages()).find(item => item.id === String(memberPackageId)).canJoin365, false);
    const firstMemberCommission = await Commission.findOne({ orderId: firstMemberOrderId }).lean();
    assert.equal(firstMemberCommission.periodNumber, 1);
    assert.equal(firstMemberCommission.accruedCents, 7300);
    const portalRead = async route => {
      const response = await fetch(`${base}/api/market-partner/${route}`, {
        headers: { authorization: `Bearer ${memberPortalToken}` },
      });
      assert.equal(response.status, 200);
      return (await response.json()).data;
    };
    const memberOrders = await portalRead('orders');
    assert.equal(memberOrders.length, 1);
    assert.equal(memberOrders[0].orderNo, (await Order.findById(firstMemberOrderId)).orderNo);
    assert.equal(memberOrders[0].paidAmount, 365);
    const memberCommissions = await portalRead('commissions');
    assert.equal(memberCommissions.length, 1);
    assert.equal(memberCommissions[0].accruedCents, 7300);
    assert.equal(memberCommissions[0].periodNumber, 1);
    const secondMemberOrderId = await memberCheckout();
    const secondMemberPayment = await Payment.findOne({ order: secondMemberOrderId });
    await require('../src/utils/orderSettlement').confirmPayment({
      outTradeNo: secondMemberPayment.outTradeNo, transactionId: 'SYNTHETIC-MEMBER-002',
      paidAt: new Date(Date.now() + 1000) });
    const secondMemberCommission = await Commission.findOne({ orderId: secondMemberOrderId }).lean();
    assert.equal(secondMemberCommission.periodNumber, 2);
    assert.equal(secondMemberCommission.accruedCents, 3650);

    // 经营总览须汇总完整付款期、退款回溯和三类互斥推广来源，且隔离其他机构。
    const overviewPaidAt = new Date('2030-01-01T04:00:00Z');
    await Order.collection.insertMany([
      { _id: oid(), tenantId, user: patientId, serviceName: '合成合伙人服务', serviceId: String(productId),
        paymentStatus: 'paid', paymentMethod: 'wechat', paidAt: overviewPaidAt, paidAmount: 100.05,
        refundedAmount: 20, marketPartnerId: partner.body.data._id, referrerId: clerkId },
      { _id: oid(), tenantId, user: patientId, serviceName: '合成员工服务', serviceId: String(productId),
        paymentStatus: 'paid', paymentMethod: 'onsite', paidAt: overviewPaidAt, paidAmount: 50,
        refundedAmount: 0, referrerId: clerkId },
      { _id: oid(), tenantId, user: patientId, serviceName: '合成自然订单', serviceId: String(productId),
        paymentStatus: 'refunded', paymentMethod: 'wechat', paidAt: overviewPaidAt, paidAmount: 25,
        refundedAmount: 25 },
      { _id: oid(), tenantId: otherTenantId, user: outsiderPatientId, serviceName: '异机构订单',
        paymentStatus: 'paid', paymentMethod: 'wechat', paidAt: overviewPaidAt, paidAmount: 200 },
      { _id: oid(), tenantId, user: patientId, serviceName: '零元权益履约',
        paymentStatus: 'paid', paidAt: overviewPaidAt, paidAmount: 0 },
    ]);
    const overview = await call(clerkId, 'GET', `${prefix}/business-overview?from=2030-01-01&to=2030-01-01`);
    assert.equal(overview.status, 200, JSON.stringify(overview.body));
    assert.equal(overview.body.data.total.paidCents, 17505);
    assert.equal(overview.body.data.total.refundedCents, 4500);
    assert.equal(overview.body.data.total.netCents, 13005);
    assert.equal(overview.body.data.sources.partner.netCents, 8005);
    assert.equal(overview.body.data.sources.staff.netCents, 5000);
    assert.equal(overview.body.data.sources.unassigned.netCents, 0);
    assert.equal(overview.body.data.partners[0].name, '合成合伙人');
    assert.equal((await call(outsiderId, 'GET', `${prefix}/business-overview?from=2030-01-01&to=2030-01-01`)).body.data.total.netCents, 20000);
    const businessOrders = await call(clerkId, 'GET',
      `${prefix}/business-orders?from=2030-01-01&to=2030-01-01&page=1&pageSize=2`);
    assert.equal(businessOrders.status, 200, JSON.stringify(businessOrders.body));
    assert.equal(businessOrders.body.data.count, 3, '明细不含零元权益与异机构订单');
    assert.equal(businessOrders.body.data.rows.length, 2);
    const partnerBusinessOrders = await call(clerkId, 'GET',
      `${prefix}/business-orders?from=2030-01-01&to=2030-01-01&source=partner`);
    assert.equal(partnerBusinessOrders.body.data.count, 1);
    assert.equal(partnerBusinessOrders.body.data.rows[0].netCents, 8005);
    assert.equal((await call(outsiderId, 'GET',
      `${prefix}/business-orders?from=2030-01-01&to=2030-01-01`)).body.data.count, 1);

    // 草稿可修订；已发布版不可原位更改，只能以不重叠的新版接续。
    const nextEffective = new Date(Date.now() + 3 * 86400000).toISOString();
    const nextPartnerDraft = await call(clerkId, 'POST', `${prefix}/rules`, {
      productId: String(productId), productLine: 'singleVisit', kind: 'first',
      firstBasisPoints: 1000, effectiveFrom: nextEffective });
    assert.equal(nextPartnerDraft.status, 201, JSON.stringify(nextPartnerDraft.body));
    const partnerDraftEdit = { updatedAt: nextPartnerDraft.body.data.updatedAt,
      kind: 'first', firstBasisPoints: 1200, tierBasisPoints: [], renewalBasisPoints: [],
      effectiveFrom: nextEffective };
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/rules/${nextPartnerDraft.body.data._id}`,
      partnerDraftEdit)).status, 200);
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/rules/${nextPartnerDraft.body.data._id}`,
      partnerDraftEdit)).status, 409, '旧页面不能覆盖新草稿');
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/rules/${rule.body.data._id}`,
      partnerDraftEdit)).status, 409, '已发布版不可原位更改');
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/rules/${nextPartnerDraft.body.data._id}/publish`,
      {})).status, 409, '规则时间重叠不得发布');
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/rules/${rule.body.data._id}/end`,
      { effectiveUntil: nextEffective })).status, 200);
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/rules/${nextPartnerDraft.body.data._id}/publish`,
      {})).status, 200);

    const nextTeamDraft = await call(clerkId, 'POST', `${prefix}/team-rules`, {
      productId: String(annualProductId), role: 'nutritionist', trigger: 'service_completed',
      ruleType: 'percentage', basisPoints: 500, effectiveFrom: nextEffective });
    assert.equal(nextTeamDraft.status, 201, JSON.stringify(nextTeamDraft.body));
    const teamDraftEdit = { updatedAt: nextTeamDraft.body.data.updatedAt, ruleType: 'percentage',
      basisPoints: 600, amountCents: 0, effectiveFrom: nextEffective };
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/team-rules/${nextTeamDraft.body.data._id}`,
      teamDraftEdit)).status, 200);
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/team-rules/${teamRule.body.data._id}`,
      teamDraftEdit)).status, 409);
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/team-rules/${nextTeamDraft.body.data._id}/publish`,
      {})).status, 409);
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/team-rules/${teamRule.body.data._id}/end`,
      { effectiveUntil: nextEffective })).status, 200);
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/team-rules/${nextTeamDraft.body.data._id}/publish`,
      {})).status, 200);

    const profile = (await call(clerkId, 'GET', prefix)).body.data.find(item =>
      String(item._id) === String(partner.body.data._id));
    const profileEdit = { name: '合成合伙人新名称', phone: '13900000001', productLine: profile.productLine,
      contractReference: profile.contractReference, updatedAt: profile.updatedAt,
      reason: '隔离环境验证资料修改留痕' };
    const editedProfile = await call(clerkId, 'PATCH', `${prefix}/${profile._id}`, profileEdit);
    assert.equal(editedProfile.status, 200, JSON.stringify(editedProfile.body));
    assert.equal(editedProfile.body.data.changeHistory.length, 1);
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/${profile._id}`, profileEdit)).status, 409);
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/${profile._id}`, {
      ...profileEdit, updatedAt: editedProfile.body.data.updatedAt,
      productLine: 'medicalAssist' })).status, 409, '启用期间不得直接切换授权线');
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/${profile._id}/status`,
      { status: 'suspended' })).status, 200);
    const suspended = (await call(clerkId, 'GET', prefix)).body.data.find(item =>
      String(item._id) === String(profile._id));
    const changedLine = await call(clerkId, 'PATCH', `${prefix}/${profile._id}`, {
      ...profileEdit, updatedAt: suspended.updatedAt, productLine: 'medicalAssist',
      reason: '隔离环境验证暂停后调整产品线' });
    assert.equal(changedLine.status, 200, JSON.stringify(changedLine.body));
    assert.equal(changedLine.body.data.changeHistory.length, 2);
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/${profile._id}/status`,
      { status: 'active' })).status, 200);

    // 管理服务直接分配给团队，不需要虚构两个商城子产品。
    const managedItems = [
      { key: 'advisor', name: '健康顾问管理', units: 1, teamRole: 'familyDoctor', revenueSharePercent: 60 },
      { key: 'manager', name: '健管专员跟进', units: 1, teamRole: 'healthManager', revenueSharePercent: 40 },
    ];
    const managedProduct = await call(clerkId, 'POST', '/api/admin/products', {
      name: '年度管理服务五千元', category: 'health', originalPrice: 5000, status: 'off', serviceItems: managedItems });
    assert.equal(managedProduct.status, 200, JSON.stringify(managedProduct.body));
    const managedOrder = await Order.create({ tenantId, user: patientId,
      serviceId: managedProduct.body.data._id, serviceName: '年度管理服务五千元', orderType: 'product',
      orderNo: 'SYNTHETIC-MANAGED-5000', paymentStatus: 'paid', paymentMethod: 'wechat', paidAt: new Date(), paidAmount: 5000,
      serviceItemsSnapshot: managedItems });
    const managedDoctorEvidence = oid(), managedManagerEvidence = oid(), managedManagerId = oid();
    await mongoose.connection.db.collection('admins').insertOne({ _id: managedManagerId, tenantId,
      username: 'managed-manager', name: '管理服务健管专员', password: 'unused', role: 'healthManager' });
    await Order.collection.updateOne({ _id: managedOrder._id }, { $set: { redemptions: [
      { _id: managedDoctorEvidence, sequence: 1, serviceItemKey: 'advisor', redeemedBy: compositeDoctorId, redeemedAt: new Date() },
      { _id: managedManagerEvidence, sequence: 2, serviceItemKey: 'manager', redeemedBy: managedManagerId, redeemedAt: new Date() },
    ] } });
    await Payment.collection.insertOne({ _id: oid(), order: managedOrder._id, user: patientId,
      channel: 'wechat_pay', status: 'succeeded', amount: 5000,
      outTradeNo: 'MANAGED-5000-PAID', paidAt: new Date() });
    const managedAccounting = await call(clerkId, 'GET', `${prefix}/order-accounting/${managedOrder._id}`);
    assert.deepEqual(managedAccounting.body.data.revenueAllocation.map(item => item.amountCents), [300000, 200000]);
    const managedRevenue = await call(clerkId, 'GET', `${prefix}/team-revenue`);
    assert.deepEqual(managedRevenue.body.data.filter(item => ['advisor', 'manager'].includes(item.serviceItemKey))
      .map(item => item.amountCents), [300000, 200000]);
    for (const role of ['familyDoctor', 'healthManager']) {
      const managedRule = await call(clerkId, 'POST', `${prefix}/team-rules`, {
        productId: String(managedProduct.body.data._id), role, trigger: 'service_completed',
        ruleType: 'percentage', basisPoints: 500, effectiveFrom: new Date(Date.now() - 86400000).toISOString() });
      assert.equal(managedRule.status, 201, JSON.stringify(managedRule.body));
      assert.equal((await call(clerkId, 'PATCH', `${prefix}/team-rules/${managedRule.body.data._id}/publish`, {})).status, 200);
    }
    const managedIncentive = await call(clerkId, 'POST', `${prefix}/team-incentives`, {
      orderId: String(managedOrder._id), staffId: String(compositeDoctorId), role: 'familyDoctor',
      serviceItemKey: 'advisor', serviceEvidenceId: String(managedDoctorEvidence) });
    assert.equal(managedIncentive.status, 201, JSON.stringify(managedIncentive.body));
    assert.equal(managedIncentive.body.data.basisCents, 300000);
    assert.equal(managedIncentive.body.data.amountCents, 15000);
    assert.equal((await call(clerkId, 'POST', `${prefix}/team-incentives`, {
      orderId: String(managedOrder._id), staffId: String(managedManagerId), role: 'healthManager',
      serviceItemKey: 'manager', serviceEvidenceId: String(managedManagerEvidence) })).status, 201);
    await Refund.collection.insertOne({ _id: oid(), order: managedOrder._id, user: patientId,
      status: 'succeeded', amount: 1000, totalAmount: 5000,
      outRefundNo: 'MANAGED-5000-REFUND', succeededAt: new Date() });
    await Order.collection.updateOne({ _id: managedOrder._id }, { $set: { refundedAmount: 1000 } });
    await require('../src/utils/teamIncentiveSettlement').syncOrder(await Order.findById(managedOrder._id));
    assert.equal((await TeamIncentive.findById(managedIncentive.body.data._id)).basisCents, 240000);

    // 新入口按人员与类别批量设置；订单按付款时有效的员工版本和合伙人个人规则取值。
    const personPrefix = '/api/admin/person-commission-rules';
    const staffSave = await call(clerkId, 'POST', `${personPrefix}/staff`, {
      staffId: String(plannerId), category: 'health', productIds: [String(productId)],
      referrerRate: 10, fulfillerRate: 3 });
    assert.equal(staffSave.status, 201, JSON.stringify(staffSave.body));
    const personStaffOrder = await Order.create({ tenantId, user: patientId, serviceId: String(productId),
      serviceName: '员工转介绍合成单', orderType: 'product', orderNo: 'SYNTHETIC-PERSON-1',
      paymentStatus: 'paid', paymentMethod: 'wechat', paidAt: new Date(), paidAmount: 1000,
      referrerId: plannerId });
    await require('../src/utils/commissionSettlement').settleReferralCommission(personStaffOrder);
    const personStaffCommission = await require('../src/models/Commission').findOne({ orderId: personStaffOrder._id,
      role: 'referrer' }).lean();
    assert.equal(personStaffCommission.commissionAmount, 100);
    assert.equal(String(personStaffCommission.staffCommissionRuleId), String(staffSave.body.data._id));
    const newerStaff = await call(clerkId, 'POST', `${personPrefix}/staff`, {
      staffId: String(plannerId), category: 'health', productIds: [String(productId)],
      referrerRate: 0, fulfillerRate: 0 });
    assert.equal(newerStaff.status, 201, JSON.stringify(newerStaff.body));
    assert.equal((await require('../src/utils/staffCommissionRule').forOrder(personStaffOrder, plannerId)).sourceRuleVersion, 1);
    const otherProductId = oid();
    await mongoose.connection.db.collection('products').insertOne({ _id: otherProductId, tenantId,
      name: '同类别不同佣金商品', category: 'health', status: 'on', originalPrice: 200 });
    const otherStaffRule = await call(clerkId, 'POST', `${personPrefix}/staff`, {
      staffId: String(plannerId), category: 'health', productIds: [String(otherProductId)],
      referrerRate: 8, fulfillerRate: 2 });
    assert.equal(otherStaffRule.status, 201, JSON.stringify(otherStaffRule.body));
    const currentStaff = await require('../src/models/StaffCommissionRule').findOne({ _id: newerStaff.body.data._id }).lean();
    assert.equal(currentStaff.effectiveUntil, null, 'saving another product must preserve the first product rule');
    assert.equal((await call(clerkId, 'POST', `${personPrefix}/staff`, {
      staffId: String(plannerId), category: 'health', productIds: [String(productId), String(otherProductId)],
      referrerRate: 8, fulfillerRate: 2 })).status, 400, 'bulk category save must be rejected');
    const partnerSave = await call(clerkId, 'POST', `${personPrefix}/partners`, {
      partnerId: String(profile._id), productLine: 'medicalAssist', category: 'health',
      productIds: [String(productId)], kind: 'first', firstPercent: 12, renewals: [] });
    assert.equal(partnerSave.status, 201, JSON.stringify(partnerSave.body));
    const active = await require('../src/utils/marketPartnerAttribution').activeRule(tenantId, productId,
      new Date(), profile._id);
    assert.equal(String(active._id), String(partnerSave.body.data[0]._id));

    const segmentPartner = await call(clerkId, 'POST', prefix, { name: '咨询板块合伙人',
      phone: '13900000009', segment: 'consultation', contractReference: 'CONSULT-001' });
    assert.equal(segmentPartner.status, 201, JSON.stringify(segmentPartner.body));
    assert.equal(segmentPartner.body.data.segment, 'consultation');
    assert.equal((await call(clerkId, 'PATCH', `${prefix}/${segmentPartner.body.data._id}/status`,
      { status: 'active' })).status, 200);
    const segmentProductRule = await call(clerkId, 'POST', `${personPrefix}/partners`, {
      partnerId: segmentPartner.body.data._id, productLine: 'consultation', category: 'health',
      productIds: [String(otherProductId)], kind: 'first', firstPercent: 9, renewals: [] });
    assert.equal(segmentProductRule.status, 201, JSON.stringify(segmentProductRule.body));
    const segmentAnnualRule = await call(clerkId, 'POST', `${personPrefix}/partners`, {
      partnerId: segmentPartner.body.data._id, productLine: 'consultation', category: '365会员',
      productIds: [String(memberPackageId)], kind: 'annual', firstPercent: 20,
      renewals: [{ year: 2, percent: 10 }, ...[3, 4, 5].map(year => ({ year, percent: 5 }))] });
    assert.equal(segmentAnnualRule.status, 201, JSON.stringify(segmentAnnualRule.body));
    assert.equal(segmentAnnualRule.body.data[0].productLine, 'consumer365');
    const segmentPatientId = oid();
    await mongoose.connection.db.collection('users').insertOne({ _id: segmentPatientId, tenantId,
      name: '跨产品合成客户' });
    const matchedProduct = await require('../src/utils/marketPartnerAttribution').claim({ tenantId,
      patientId: segmentPatientId, productId: otherProductId,
      code: segmentPartner.body.data.referralCode });
    assert.equal(String(matchedProduct.rule.partnerId), String(segmentPartner.body.data._id));
    const matchedAnnual = await require('../src/utils/marketPartnerAttribution').claim({ tenantId,
      patientId: segmentPatientId, productId: memberPackageId,
      code: segmentPartner.body.data.referralCode });
    assert.equal(matchedAnnual.rule.productLine, 'consumer365');

    // 基础服务业务量只从实际完结的服务归属累计，门槛以员工个人保存。
    const thresholdStaffId = oid();
    await mongoose.connection.db.collection('admins').insertOne({ _id: thresholdStaffId,
      tenantId, username: 'threshold-staff', name: '门槛合成员工', password: 'unused',
      role: 'healthPlanner', staffStatus: 'active' });
    const thresholdSave = await call(clerkId, 'POST', `${personPrefix}/service-thresholds`, {
      staffId: String(thresholdStaffId), thresholdYuan: 3000 });
    assert.equal(thresholdSave.status, 201, JSON.stringify(thresholdSave.body));
    const completedAt = new Date();
    const thresholdOrderId = oid();
    await Order.collection.insertOne({ _id: thresholdOrderId, tenantId, user: patientId,
      orderNo: 'SYNTHETIC-THRESHOLD-1', status: 'completed', paymentStatus: 'paid',
      paidAmount: 4000, refundedAmount: 0, paidAt: completedAt, verifiedAt: completedAt,
      businessAllocationsSnapshot: [{ key: 'care', name: '实际服务', businessType: 'service',
        teamRole: 'familyDoctor', revenueSharePercent: 100, allocationAmountCents: 400000 }],
      servicePerformers: [{ role: 'familyDoctor', staffId: thresholdStaffId }] });
    const month = require('../src/utils/staffServiceThreshold').monthOf(completedAt);
    const volume = await call(clerkId, 'GET', `${personPrefix}/service-thresholds/volume?staffId=${thresholdStaffId}&month=${month}`);
    assert.equal(volume.status, 200, JSON.stringify(volume.body));
    assert.equal(volume.body.data.volumeCents, 400000);
    assert.equal(volume.body.data.excessCents, 100000);
    assert.equal(volume.body.data.quarterThresholdCents, 900000);
    assert.equal(volume.body.data.quarterExcessCents, 0);
    const teamPrefix = '/api/admin/partner-teams';
    const thresholdLeaderId = oid();
    await mongoose.connection.db.collection('admins').insertOne({ _id: thresholdLeaderId,
      tenantId, username: 'threshold-leader', name: '门槛合成负责人', password: 'unused',
      role: 'healthPlanner', staffStatus: 'active' });
    assert.equal((await call(clerkId, 'POST', `${teamPrefix}/teams`, {
      leaderType: 'staff', leaderId: String(thresholdLeaderId),
    })).status, 201);
    const relation = await call(clerkId, 'POST', `${teamPrefix}/relations`, {
      leaderType: 'staff', leaderId: String(thresholdLeaderId),
      memberType: 'staff', memberId: String(thresholdStaffId) });
    assert.equal(relation.status, 201, JSON.stringify(relation.body));
    const leaderServiceRule = await call(clerkId, 'POST', `${teamPrefix}/relations/${relation.body.data._id}/rules`, {
      activity: 'service', calculationType: 'percentage', value: 5 });
    assert.equal(leaderServiceRule.status, 201, JSON.stringify(leaderServiceRule.body));
    await Order.collection.updateOne({ _id: thresholdOrderId },
      { $set: { verifiedAt: new Date() } });
    await require('../src/utils/partnerTeamEarning').syncOrderServices(await Order.findById(thresholdOrderId));
    const teamEarning = await require('../src/models/PartnerTeamEarning').findOne({
      tenantId, orderId: thresholdOrderId, activity: 'service' }).lean();
    assert.equal(teamEarning.basisCents, 400000);
    assert.equal(teamEarning.accruedCents, 20000,
      'leader service reward must be independent of the member personal service fee');
    const removedStaff = await call(clerkId, 'POST',
      `${personPrefix}/staff/${otherStaffRule.body.data._id}/remove-promotion`,
      { productId: String(otherProductId) });
    assert.equal(removedStaff.status, 201, JSON.stringify(removedStaff.body));
    assert.equal(removedStaff.body.data.referrerRate, 0);
    assert.equal(removedStaff.body.data.fulfillerRate, 2,
      'removing promotion must preserve the employee service fee');
    assert.equal((await require('../src/models/StaffCommissionRule').findById(otherStaffRule.body.data._id)).effectiveUntil !== null, true);
    const removedPartner = await call(clerkId, 'POST',
      `${personPrefix}/partners/${segmentProductRule.body.data[0]._id}/remove-promotion`);
    assert.equal(removedPartner.status, 201, JSON.stringify(removedPartner.body));
    assert.equal(removedPartner.body.data.disabled, true);
    assert.equal(await require('../src/utils/marketPartnerAttribution').activeRule(tenantId,
      otherProductId, new Date(), segmentPartner.body.data._id), null);
    const remainingPromotable = await call(clerkId, 'GET',
      `${prefix}/${segmentPartner.body.data._id}/promotable-products`);
    assert.equal(remainingPromotable.body.data.rows.some(row => String(row.productId) === String(otherProductId)), false);
  });
