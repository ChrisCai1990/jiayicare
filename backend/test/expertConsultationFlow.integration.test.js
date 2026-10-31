const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const mongoose = require('mongoose');
const router = require('../src/routes/expertConsultations');
const scheduleRouter = require('../src/routes/staffAvailability');
const Case = require('../src/models/ExpertConsultationCase');
const Order = require('../src/models/Order');
const StaffAvailability = require('../src/models/StaffAvailability');
const { tenantContext } = require('../src/utils/tenantScope');

const oid = () => new mongoose.Types.ObjectId();
const handler = (source, method, route) => source.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const withTenant = (tenantId, request, callback) => new Promise((resolve, reject) => tenantContext({ ...request, staff: request.staff && { ...request.staff, tenantId }, user: request.user && { ...request.user, tenantId } }, {}, () => Promise.resolve().then(callback).then(resolve, reject)));

test('paid single consultation runs from customer request through booked schedule to reviewed follow-up',
  { skip: !process.env.TEST_MONGOD, timeout: 60000 }, async t => {
    const dbpath = mkdtempSync(path.join(tmpdir(), 'expert-consultation-'));
    const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); }); });
    const mongod = spawn(process.env.TEST_MONGOD, ['--dbpath', dbpath, '--bind_ip', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(async () => { await mongoose.disconnect(); mongod.kill(); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Mongo startup timeout')), 30000);
      mongod.once('error', reject); mongod.once('exit', code => reject(new Error(`Mongo exited ${code}`)));
      mongod.stdout.on('data', chunk => { if (String(chunk).includes('Waiting for connections')) { clearTimeout(timer); resolve(); } });
      mongod.stderr.resume();
    });
    await mongoose.connect(`mongodb://127.0.0.1:${port}/expert_consultation_test`, { autoIndex: false });
    const tenantId = oid(), patientId = oid(), managerId = oid(), advisorId = oid(), plannerId = oid(), expertStaffId = oid(), expertId = oid(), orderId = oid();
    const startAt = new Date(Date.now() + 86400000), endAt = new Date(+startAt + 20 * 60000);
    const expertSlot = oid(), managerSlot = oid();
    await mongoose.connection.db.collection('users').insertOne({ _id: patientId, tenantId, assignedHealthManager: managerId, assignedFamilyDoctor: advisorId, assignedHealthPlanner: plannerId });
    await mongoose.connection.db.collection('orders').insertOne({ _id: orderId, tenantId, user: patientId, serviceId: String(oid()), serviceName: '单次专家咨询分析', paymentStatus: 'paid', tradeStatus: 'paid', status: 'pending', refundStatus: 'none', totalUnits: 1, serviceWorkflowSnapshot: { key: 'expert_consultation' } });
    await mongoose.connection.db.collection('admins').insertOne({ _id: expertStaffId, tenantId, name: '测试专家', role: 'specialist', staffStatus: 'active' });
    await mongoose.connection.db.collection('admins').insertMany([
      { _id: managerId, tenantId, name: '健管专员', role: 'healthManager', staffStatus: 'active' },
      { _id: advisorId, tenantId, name: '健康顾问', role: 'familyDoctor', staffStatus: 'active' },
      { _id: plannerId, tenantId, name: '健康规划师', role: 'healthPlanner', staffStatus: 'active' },
    ]);
    await mongoose.connection.db.collection('medicalexperts').insertOne({ _id: expertId, tenantId, name: '测试专家', status: 'active', teamEligible: true, serviceModes: ['single_consultation'], singleConsultationFee: 180, mdtFee: 180, linkedStaffId: expertStaffId });
    await mongoose.connection.db.collection('staffavailabilities').insertMany([
      { _id: expertSlot, tenantId, staffId: expertStaffId, startAt, endAt, status: 'available' },
      { _id: managerSlot, tenantId, staffId: managerId, startAt, endAt, status: 'available' },
    ]);
    const call = async (method, route, request) => {
      const res = response();
      await withTenant(tenantId, request, () => handler(router, method, route)(request, res));
      return res;
    };
    const customer = { user: { _id: patientId, tenantId }, body: { orderId: String(orderId), request: '请分析下一步管理方向' } };
    const created = await call('post', '/mine', customer);
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    let caseId = created.body.data.id;
    const step = async (action, staffId, body) => call('post', `/staff/:id/${action}`, { params: { id: String(caseId) }, staff: { _id: staffId, role: 'healthPlanner' }, body });
    assert.equal((await step('intake', managerId, { summary: '已核实既往资料' })).statusCode, 200);
    assert.equal((await step('referral', advisorId, { purpose: '分析管理方向', questions: '下一步做什么？' })).statusCode, 200);
    const missingManager = await step('assign', plannerId, { members: [{ expertId, slotId: expertSlot }] });
    assert.equal(missingManager.statusCode, 409);
    const assigned = await step('assign', plannerId, { members: [{ expertId, slotId: expertSlot }], managerSlotId: managerSlot });
    assert.equal(assigned.statusCode, 200, JSON.stringify(assigned.body));
    assert.equal((await StaffAvailability.findById(expertSlot)).status, 'booked');
    assert.equal((await StaffAvailability.findById(managerSlot)).status, 'booked');
    assert.equal((await step('meeting', plannerId, { meetingUrl: 'https://meeting.example.test/room' })).statusCode, 200);
    const customerView = await call('get', '/mine', { user: { _id: patientId, tenantId } });
    assert.equal(customerView.body.data[0].meetingUrl, 'https://meeting.example.test/room');
    assert.equal((await step('reply', expertStaffId, { opinion: '现有资料不足以支持进一步改变方案', nextStep: '维持现有管理并复查', noBetterOption: true })).statusCode, 200);
    assert.equal((await step('reconcile', advisorId, { note: '暂无矛盾；维持现有管理并复查' })).statusCode, 200);
    assert.equal((await step('followup', managerId, { plan: '客户自行管理，每月复查', selfManaged: true })).statusCode, 200);
    assert.equal((await step('complete', advisorId, {})).statusCode, 200);
    assert.equal((await Case.findById(caseId)).status, 'completed');
    assert.equal((await Order.findById(orderId)).tradeStatus, 'completed');
    const secondOrderId = oid(), secondExpertId = oid(), secondExpertStaffId = oid();
    const firstMdtStart = new Date(Date.now() + 2 * 86400000), firstMdtEnd = new Date(+firstMdtStart + 20 * 60000);
    const secondMdtEnd = new Date(+firstMdtEnd + 20 * 60000);
    const mdtSlotOne = oid(), mdtSlotTwo = oid(), advisorSlot = oid();
    await mongoose.connection.db.collection('orders').insertOne({ _id: secondOrderId, tenantId, user: patientId, serviceId: String(oid()), serviceName: 'MDT咨询', paymentStatus: 'paid', tradeStatus: 'paid', status: 'pending', refundStatus: 'none', totalUnits: 1, serviceWorkflowSnapshot: { key: 'mdt_consultation' } });
    await mongoose.connection.db.collection('admins').insertOne({ _id: secondExpertStaffId, tenantId, name: '第二专家', role: 'specialist', staffStatus: 'active' });
    await mongoose.connection.db.collection('medicalexperts').insertMany([
      { _id: secondExpertId, tenantId, name: '第二专家', status: 'active', teamEligible: true, serviceModes: ['mdt'], mdtFee: 190, linkedStaffId: secondExpertStaffId },
    ]);
    await mongoose.connection.db.collection('medicalexperts').updateOne({ _id: expertId }, { $addToSet: { serviceModes: 'mdt' } });
    await mongoose.connection.db.collection('staffavailabilities').insertMany([
      { _id: mdtSlotOne, tenantId, staffId: expertStaffId, startAt: firstMdtStart, endAt: firstMdtEnd, status: 'available' },
      { _id: mdtSlotTwo, tenantId, staffId: secondExpertStaffId, startAt: firstMdtEnd, endAt: secondMdtEnd, status: 'available' },
      { _id: advisorSlot, tenantId, staffId: advisorId, startAt: firstMdtStart, endAt: secondMdtEnd, status: 'available' },
    ]);
    await mongoose.connection.db.collection('users').updateOne({ _id: patientId }, { $set: { assignedFamilyDoctor: null } });
    const mdtCreated = await call('post', '/mine', { user: { _id: patientId, tenantId }, body: { orderId: String(secondOrderId), request: '多学科意见不一致' } });
    assert.equal(mdtCreated.statusCode, 201);
    caseId = mdtCreated.body.data.id;
    assert.equal(mdtCreated.body.data.status, 'team_assignment');
    const teamAssigned = await call('post', '/staff/:id/team', { params: { id: String(caseId) }, staff: { _id: plannerId, role: 'healthPlanner' }, body: { advisorId } });
    assert.equal(teamAssigned.statusCode, 200, JSON.stringify(teamAssigned.body));
    await step('intake', managerId, { summary: '两科病历和检查结果' });
    await step('referral', advisorId, { purpose: '协调意见', questions: '如何选择下一步？' });
    const mdtAssigned = await step('assign', plannerId, { members: [{ expertId, slotId: mdtSlotOne }, { expertId: secondExpertId, slotId: mdtSlotTwo }], advisorSlotId: advisorSlot });
    assert.equal(mdtAssigned.statusCode, 200, JSON.stringify(mdtAssigned.body));
    await step('reply', expertStaffId, { opinion: '先复查', nextStep: '一月后复查' });
    await step('reply', secondExpertStaffId, { opinion: '尽快线下就诊', nextStep: '一周内就诊' });
    const conflict = await step('reconcile', advisorId, { note: '复查时间存在冲突，需说明依据', requestChanges: true });
    assert.equal(conflict.body.data.status, 'expert');
    await step('reply', expertStaffId, { opinion: '结合新增资料建议线下就诊', nextStep: '一周内就诊' });
    await step('reply', secondExpertStaffId, { opinion: '维持意见', nextStep: '一周内就诊' });
    const reconciled = await step('reconcile', advisorId, { note: '两科已协调：一周内就诊' });
    assert.equal(reconciled.body.data.status, 'followup');
    assert.equal((await Case.findById(caseId)).members[0].revisions.length, 1);
    const wrongTenant = oid();
    const staffList = handler(router, 'get', '/staff');
    const visible = response();
    await withTenant(tenantId, { staff: { _id: plannerId, role: 'healthPlanner' } }, () => staffList({ staff: { _id: plannerId, role: 'healthPlanner' } }, visible));
    assert.equal(visible.body.data.length, 2);
    const hidden = response();
    await withTenant(wrongTenant, { staff: { _id: plannerId, role: 'healthPlanner' } }, () => staffList({ staff: { _id: plannerId, role: 'healthPlanner' } }, hidden));
    assert.equal(hidden.body.data.length, 0);
    const bookedDeletion = response();
    await withTenant(tenantId, { staff: { _id: managerId, role: 'healthManager' } }, () => handler(scheduleRouter, 'delete', '/:id')({ params: { id: String(managerSlot) }, staff: { _id: managerId, role: 'healthManager' } }, bookedDeletion));
    assert.equal(bookedDeletion.statusCode, 409);
  });
