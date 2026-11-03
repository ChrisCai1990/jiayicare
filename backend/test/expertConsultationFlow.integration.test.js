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
const Referral = require('../src/models/Referral');
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
    const createReferral = (reason, medicalExpertId = expertId) => Referral.create({ patientId, fromStaffId: advisorId,
      referralType: 'external_medical', medicalExpertId, reason, referralPurpose: reason,
      questionList: '下一步如何安排？', content: '已核实相关资料', status: 'pending' });
    assert.equal(created.body.data.status, 'team_assignment', '商城订单必须先由规划师派单');
    assert.equal((await step('intake', managerId, { summary: '不能绕过首次派单' })).statusCode, 409);
    assert.equal((await step('team', plannerId, { managerId })).statusCode, 200);
    assert.equal((await step('intake', managerId, { summary: '已核实既往资料' })).statusCode, 200);
    assert.equal((await step('referral', advisorId, { purpose: '分析管理方向', questions: '下一步做什么？' })).statusCode, 400);
    const firstReferral = await createReferral('分析管理方向');
    const available = await call('get', '/staff/:id/referrals', { params: { id: String(caseId) }, staff: { _id: advisorId } });
    assert.equal(available.body.data.length, 1);
    assert.equal((await step('referral', advisorId, { referralId: String(firstReferral._id) })).statusCode, 200);
    assert.equal(String((await Referral.findById(firstReferral._id)).expertConsultationCaseId), String(caseId));
    const replacementReferral = await createReferral('修订后的咨询转介');
    assert.equal((await step('referral', advisorId, { referralId: String(replacementReferral._id) })).statusCode, 200);
    assert.equal((await Referral.findById(firstReferral._id)).expertConsultationCaseId, null);
    assert.equal(String((await Referral.findById(replacementReferral._id)).expertConsultationCaseId), String(caseId));
    assert.equal((await step('assign', plannerId, { members: [{ expertId, slotId: expertSlot }] })).statusCode, 403, '规划师不能代为预约');
    assert.equal((await step('confirm-experts', managerId, { expertIds: [expertId] })).statusCode, 403, '专员不能代顾问确认专家');
    assert.equal((await step('assign', managerId, { members: [{ expertId, slotId: expertSlot }], managerSlotId: managerSlot })).statusCode, 409);
    assert.equal((await step('confirm-experts', advisorId, { expertIds: [expertId] })).statusCode, 200);
    const missingManager = await step('assign', managerId, { members: [{ expertId, slotId: expertSlot }] });
    assert.equal(missingManager.statusCode, 409);
    const assigned = await step('assign', managerId, { members: [{ expertId, slotId: expertSlot }], managerSlotId: managerSlot });
    assert.equal(assigned.statusCode, 200, JSON.stringify(assigned.body));
    // Read receipt is explicit, recipient-only, versioned and idempotent.
    assert.equal((await step('referral-viewed', managerId, { referralId: String(replacementReferral._id), contentVersion: 0 })).statusCode, 403);
    const detail = await call('get', '/staff/:id/referral-detail', { params: { id: String(caseId) }, staff: { _id: expertStaffId } });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.body.data.contentVersion, 0);
    assert.equal((await Case.findById(caseId)).members[0].viewedAt, null, 'loading details alone does not record a view');
    const receipt = await step('referral-viewed', expertStaffId, { referralId: String(replacementReferral._id), contentVersion: 0 });
    assert.equal(receipt.statusCode, 200);
    const again = await step('referral-viewed', expertStaffId, { referralId: String(replacementReferral._id), contentVersion: 0 });
    assert.equal(+new Date(again.body.data.viewedAt), +new Date(receipt.body.data.viewedAt));
    await Referral.updateOne({ _id: replacementReferral._id }, { $inc: { contentVersion: 1 } });
    assert.equal((await step('referral-viewed', expertStaffId, { referralId: String(replacementReferral._id), contentVersion: 0 })).statusCode, 409);
    assert.equal((await Case.findById(caseId)).members[0].viewedVersion, 0);
    assert.equal((await step('referral-viewed', expertStaffId, { referralId: String(replacementReferral._id), contentVersion: 1 })).statusCode, 200);
    assert.equal((await Case.findById(caseId)).members[0].viewedVersion, 1);
    const secondExpert = oid();
    await Case.updateOne({ _id: caseId }, { $push: { members: { expertId: oid(), staffId: secondExpert, slotId: oid(), startAt, endAt } } });
    assert.equal((await Case.findById(caseId)).members[1].viewedAt, null);
    assert.equal((await step('referral-viewed', secondExpert, { referralId: String(replacementReferral._id), contentVersion: 1 })).statusCode, 200);
    assert.equal((await Case.findById(caseId)).members[0].viewedVersion, 1);
    assert.ok((await Case.findById(caseId)).members[1].viewedAt);
    await Case.updateOne({ _id: caseId }, { $pull: { members: { staffId: secondExpert } } });

    assert.equal((await call('get', '/staff/:id/referral-detail', { params: { id: String(caseId) }, staff: { _id: oid() } })).statusCode, 403);
    assert.equal((await StaffAvailability.findById(expertSlot)).status, 'booked');
    assert.equal((await StaffAvailability.findById(managerSlot)).status, 'booked');
    assert.equal((await step('meeting', managerId, { meetingUrl: 'https://meeting.example.test/room' })).statusCode, 200);
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
    assert.equal((await step('intake', managerId, { summary: '两科病历和检查结果' })).statusCode, 409);
    await mongoose.connection.db.collection('users').updateOne({ _id: patientId }, { $set: { assignedFamilyDoctor: advisorId } });
    assert.equal((await step('intake', managerId, { summary: '两科病历和检查结果' })).statusCode, 200);
    const mdtReferral = await createReferral('协调多学科意见');
    assert.equal((await step('referral', advisorId, { referralId: String(replacementReferral._id) })).statusCode, 409);
    assert.equal((await step('referral', advisorId, { referralId: String(mdtReferral._id) })).statusCode, 200);
    assert.equal((await step('confirm-experts', advisorId, { expertIds: [expertId, secondExpertId] })).statusCode, 200);
    assert.equal((await step('request-expert-change', managerId, { reason: '建议协调下午时段' })).statusCode, 200);
    assert.equal((await Case.findById(caseId)).status, 'advisor');
    assert.equal((await step('confirm-experts', advisorId, { expertIds: [expertId, secondExpertId] })).statusCode, 200);
    const mdtAssigned = await step('assign', managerId, { members: [{ expertId, slotId: mdtSlotOne }, { expertId: secondExpertId, slotId: mdtSlotTwo }], advisorSlotId: advisorSlot });
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
    const unassignedPatientId = oid(), unassignedOrderId = oid();
    await mongoose.connection.db.collection('users').insertOne({ _id: unassignedPatientId, tenantId });
    await mongoose.connection.db.collection('orders').insertOne({ _id: unassignedOrderId, tenantId, user: unassignedPatientId,
      serviceId: String(oid()), serviceName: '单次专家咨询分析', paymentStatus: 'paid', tradeStatus: 'paid', status: 'pending',
      refundStatus: 'none', totalUnits: 1, serviceWorkflowSnapshot: { key: 'expert_consultation' } });
    const unassigned = await call('post', '/mine', { user: { _id: unassignedPatientId, tenantId },
      body: { orderId: String(unassignedOrderId), request: '请协助安排咨询' } });
    assert.equal(unassigned.body.data.status, 'team_assignment');
    const pending = await call('get', '/staff', { staff: { _id: plannerId, role: 'healthPlanner' } });
    assert.ok(pending.body.data.some(row => String(row._id) === String(unassigned.body.data.id)));
    const pendingMaterials = await call('get', '/staff/:id/materials', { params: { id: String(unassigned.body.data.id) },
      staff: { _id: plannerId, role: 'healthPlanner' } });
    assert.equal(pendingMaterials.statusCode, 200);
    const wrongTenantPending = await withTenant(wrongTenant, { staff: { _id: plannerId, role: 'healthPlanner' } },
      async () => { const result = response(); await staffList({ staff: { _id: plannerId, role: 'healthPlanner' } }, result); return result; });
    assert.equal(wrongTenantPending.body.data.length, 0);
    const cannotAssign = await call('post', '/staff/:id/team', { params: { id: String(unassigned.body.data.id) },
      staff: { _id: managerId, role: 'healthManager' }, body: { managerId, advisorId, plannerId } });
    assert.equal(cannotAssign.statusCode, 403);
    const claimed = await call('post', '/staff/:id/team', { params: { id: String(unassigned.body.data.id) },
      staff: { _id: plannerId, role: 'healthPlanner' }, body: { managerId, advisorId, plannerId } });
    assert.equal(claimed.statusCode, 200, JSON.stringify(claimed.body));
    assert.equal(String((await Case.findById(unassigned.body.data.id)).plannerId), String(plannerId));
    const bookedDeletion = response();
    const collection = mongoose.connection.db.collection('expertconsultationcases');
    await collection.createIndex({ tenantId: 1, orderId: 1 }, { unique: true, name: 'tenant_order_unique' });
    const migration = require('../scripts/migrateExpertConsultationSourceIndex');
    assert.equal((await migration.migrate(collection, true)).migrated, true);
    await mongoose.connection.db.collection('users').updateOne({ _id: patientId }, { $set: { assignedFamilyDoctor: advisorId } });
    await mongoose.connection.db.collection('users').updateOne({ _id: patientId }, { $set: { assignedHealthPlanner: null } });
    const staffRequest = type => call('post', '/staff', { staff: { _id: managerId, tenantId, role: 'healthManager' },
      body: { patientId: String(patientId), type, expertCount: 2, request: '医护端发起咨询' } });
    const internalSingle = await staffRequest('single');
    const internalMdt = await staffRequest('mdt');
    assert.equal(internalSingle.statusCode, 201, JSON.stringify(internalSingle.body));
    assert.equal(internalMdt.statusCode, 201, JSON.stringify(internalMdt.body));
    assert.equal((await Case.findById(internalSingle.body.data.id)).orderId, null);
    assert.equal(internalSingle.body.data.status, 'intake', '医护端直接由所属专员承接，不因缺少规划师而阻塞');
    assert.equal(String((await Case.findById(internalSingle.body.data.id)).managerId), String(managerId));
    const denied = await call('post', '/staff', { staff: { _id: oid(), tenantId, role: 'healthManager' },
      body: { patientId: String(patientId), type: 'single', request: '不应允许' } });
    assert.equal(denied.statusCode, 403);
    caseId = internalSingle.body.data.id;
    await Case.updateOne({ _id: caseId }, { $set: { status: 'team_assignment' } });
    const legacyList = await call('get', '/staff', { staff: { _id: managerId, tenantId, role: 'healthManager' } });
    assert.equal(legacyList.body.data.find(row => String(row._id) === String(caseId)).status, 'intake');
    assert.equal((await step('intake', managerId, { summary: '资料已核实' })).statusCode, 200);
    const staffReferral = await createReferral('医护端咨询分析');
    assert.equal((await step('referral', advisorId, { referralId: String(staffReferral._id) })).statusCode, 200);
    assert.equal((await step('confirm-experts', advisorId, { expertIds: [expertId] })).statusCode, 200);
    const internalExpertSlot = oid(), internalManagerSlot = oid();
    const internalStart = new Date(Date.now() + 5 * 86400000), internalEnd = new Date(+internalStart + 20 * 60000);
    await mongoose.connection.db.collection('staffavailabilities').insertMany([
      { _id: internalExpertSlot, tenantId, staffId: expertStaffId, startAt: internalStart, endAt: internalEnd, status: 'available' },
      { _id: internalManagerSlot, tenantId, staffId: managerId, startAt: internalStart, endAt: internalEnd, status: 'available' },
    ]);
    assert.equal((await step('assign', managerId, { members: [{ expertId, slotId: internalExpertSlot }], managerSlotId: internalManagerSlot })).statusCode, 200);
    await step('reply', expertStaffId, { opinion: '维持管理', nextStep: '按计划随访' });
    await step('reconcile', advisorId, { note: '按计划随访' });
    await step('followup', managerId, { plan: '每月随访', selfManaged: false });
    assert.equal((await step('complete', advisorId, {})).statusCode, 200);
    assert.equal((await Case.findById(caseId)).status, 'completed');
    const deletionRequest = { params: { id: String(managerSlot) }, staff: { _id: managerId, tenantId, role: 'healthManager' } };
    await withTenant(tenantId, deletionRequest, () => handler(scheduleRouter, 'delete', '/:id')(deletionRequest, bookedDeletion));
    assert.equal(bookedDeletion.statusCode, 409);

    // Prepared historical intake: one advisor submission must reach the manager directly.
    const ready = await Case.create({tenantId,patientId,type:'single',initiationSource:'staff',status:'intake',managerId,advisorId,plannerId});
    caseId=ready._id;
    const draftRequest={staff:{_id:advisorId,tenantId,role:'familyDoctor'},body:{patientId:String(patientId),consultationCaseId:String(caseId),referralType:'external_medical',medicalExpertId:String(expertId),reason:'已完成顾问审核',questionList:'下一步安排'}};
    const draftResponse=response();
    await withTenant(tenantId,draftRequest,()=>handler(require('../src/routes/staff'),'post','/referrals')(draftRequest,draftResponse));
    assert.equal(draftResponse.statusCode,200,JSON.stringify(draftResponse.body));
    const prepared=await Referral.findById(draftResponse.body.data._id);
    assert.equal(prepared.toStaffId,null,'内部草稿不提前发送给专家');
    assert.equal(String(prepared.expertConsultationCaseId),String(caseId));
    const payload={referralId:String(prepared._id),submitToManager:true,materialsReviewed:true};
    assert.equal((await step('referral',managerId,payload)).statusCode,403);
    assert.equal((await step('referral',advisorId,{...payload,materialsReviewed:false})).statusCode,400);
    const reportId=oid();
    await mongoose.connection.db.collection('medicalreports').insertOne({_id:reportId,tenantId,user:patientId,title:'待审来源',audit_status:'unaudited'});
    prepared.attachedHealthInfo={screeningRecords:[{来源报告编号:String(reportId)}]}; await prepared.save();
    assert.equal((await step('referral',advisorId,payload)).statusCode,409);
    assert.equal((await Case.findById(caseId)).status,'intake');
    await mongoose.connection.db.collection('medicalreports').updateOne({_id:reportId},{$set:{audit_status:'audited'}});
    const submitted=await step('referral',advisorId,payload);
    assert.equal(submitted.statusCode,200,JSON.stringify(submitted.body));
    const after=await Case.findById(caseId).populate('patientId','name').lean();
    assert.equal(after.status,'planner');assert.ok(after.expertsConfirmedAt);
    const todos=require('../src/utils/consultationTodos').consultationTodos([after],{_id:managerId,role:'healthManager'});
    assert.equal(todos.length,1);assert.equal(todos[0].label,'专家时间待预约');
    assert.equal((await step('referral',advisorId,payload)).statusCode,200,'repeat submission does not create another case');
    assert.equal(await Case.countDocuments({_id:caseId}),1);

    // Advisor can finalize confirmed expert/time directly, without a manager slot or booking todo.
    const directSlot = oid();
    await mongoose.connection.db.collection('staffavailabilities').insertOne({ _id: directSlot, tenantId, staffId: expertStaffId, startAt: new Date(Date.now()+7*86400000), endAt: new Date(Date.now()+7*86400000+30*60000), status: 'available' });
    const directBody = { directConfirmed: true, partiesConfirmed: true, materialsReviewed: true, members: [{ expertId, slotId: directSlot }] };
    assert.equal((await step('assign', managerId, directBody)).statusCode,403);
    assert.equal((await step('assign', advisorId, {...directBody, partiesConfirmed:false})).statusCode,400);
    const directResult = await step('assign', advisorId, directBody);
    assert.equal(directResult.statusCode,200,JSON.stringify(directResult.body));
    assert.equal((await Case.findById(caseId)).status,'expert');
    assert.equal((await StaffAvailability.findById(directSlot)).status,'booked');
    const directAfter = await Case.findById(caseId).populate('patientId','name').lean();
    assert.equal(require('../src/utils/consultationTodos').consultationTodos([directAfter],{_id:managerId,role:'healthManager'}).length,0);
    assert.equal((await step('assign', advisorId, directBody)).statusCode,409,'cannot dispatch twice');
    const collision = await Case.create({tenantId,patientId,type:'single',initiationSource:'staff',status:'advisor',managerId,advisorId,plannerId,referralId:prepared._id});
    caseId=collision._id;
    assert.equal((await step('assign', advisorId,directBody)).statusCode,409,'booked expert slot cannot be reused');
    assert.equal((await Case.findById(caseId)).status,'advisor','failed direct booking creates no manager task');
  });
