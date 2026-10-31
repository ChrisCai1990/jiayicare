const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Recruitment = require('../src/models/ExpertRecruitment');
const RecruitmentLink = require('../src/models/ExpertRecruitmentLink');
const MedicalInstitution = require('../src/models/MedicalInstitution');
const MedicalDepartment = require('../src/models/MedicalDepartment');
const MedicalExpert = require('../src/models/MedicalExpert');
const Admin = require('../src/models/Admin');
const router = require('../src/routes/expertRecruitment');
const { tenantContext, runWithoutTenantScope } = require('../src/utils/tenantScope');

const oid = () => new mongoose.Types.ObjectId();
const handler = (method, route) => router.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const asTenant = (tenantId, callback) => new Promise((resolve, reject) =>
  tenantContext({ admin: { _id: oid(), tenantId, role: 'superadmin' } }, {}, () => Promise.resolve().then(callback).then(resolve, reject)));

test('real isolated Mongo enforces one questionnaire submission and tenant-scoped Admin inbox',
  { skip: !process.env.TEST_MONGOD, timeout: 60000 }, async t => {
    const dbpath = mkdtempSync(path.join(tmpdir(), 'expert-recruitment-'));
    const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const selected = server.address().port; server.close(() => resolve(selected)); }); });
    const mongod = spawn(process.env.TEST_MONGOD, ['--dbpath', dbpath, '--bind_ip', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(async () => { await mongoose.disconnect(); mongod.kill(); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Mongo startup timeout')), 30000);
      mongod.once('error', reject);
      mongod.once('exit', code => reject(new Error(`Mongo exited ${code}`)));
      mongod.stdout.on('data', chunk => { if (String(chunk).includes('Waiting for connections')) { clearTimeout(timer); resolve(); } });
      mongod.stderr.resume();
    });
    await mongoose.connect(`mongodb://127.0.0.1:${port}/expert_recruitment_${crypto.randomBytes(6).toString('hex')}`, { autoIndex: false });
    const firstTenant = oid(), secondTenant = oid();
    const token = crypto.randomBytes(24).toString('base64url');
    const sha = value => crypto.createHash('sha256').update(value).digest('hex');
    await runWithoutTenantScope(() => Recruitment.collection.insertMany([
      { tenantId: firstTenant, tokenHash: sha(token), expiresAt: new Date(Date.now() + 86400000), status: 'invited', partnerName: '甲', specialtyTeam: '甲团队', candidateName: '张医生', createdBy: oid() },
      { tenantId: secondTenant, tokenHash: sha('second'), expiresAt: new Date(Date.now() + 86400000), status: 'submitted', partnerName: '乙', specialtyTeam: '乙团队', candidateName: '李医生', createdBy: oid() },
    ]));
    const submit = handler('post', '/public/:token');
    const request = { params: { token }, body: { name: '张医生', phone: '13800000000', institutionName: '合成医院', departmentName: '合成科室', registrationScope: '合成科室', singleConsultation: true, singleExpectedFee: 200, privacyAcknowledged: true } };
    const first = response(); await submit(request, first); assert.equal(first.statusCode, 201);
    const second = response(); await submit(request, second); assert.equal(second.statusCode, 409);
    const adminList = handler('get', '/admin');
    await asTenant(firstTenant, async () => {
      const res = response(); await adminList({ admin: { role: 'superadmin' } }, res);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].response.name, '张医生');
    });
    await asTenant(secondTenant, async () => {
      const res = response(); await adminList({ admin: { role: 'superadmin' } }, res);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].candidateName, '李医生');
    });
    const institutionId = oid(), departmentId = oid(), wrongDepartmentId = oid(), staffId = oid();
    await MedicalInstitution.collection.insertOne({ _id: institutionId, tenantId: firstTenant, name: '合成医院', status: 'active' });
    await MedicalDepartment.collection.insertOne({ _id: departmentId, tenantId: firstTenant, institutionId, name: '合成科室', status: 'active' });
    await MedicalDepartment.collection.insertOne({ _id: wrongDepartmentId, tenantId: firstTenant, institutionId, name: '神经内科', status: 'active' });
    await Admin.collection.insertOne({ _id: staffId, tenantId: firstTenant, name: '张医生', phone: '13800000000', role: 'specialist', staffStatus: 'active' });
    await asTenant(firstTenant, async () => {
      const row = await Recruitment.findOne({ tokenHash: sha(token) });
      const actor = { _id: oid(), tenantId: firstTenant, role: 'superadmin' };
      const screen = handler('patch', '/admin/:id/screening');
      const missingEvidence = response();
      await screen({ params: { id: String(row._id) }, admin: actor, body: { qualificationVerified: true, professional: 'pass', communication: 'pass', ethics: 'pass' } }, missingEvidence);
      assert.equal(missingEvidence.statusCode, 400);
      const screeningResponse = response();
      await screen({ params: { id: String(row._id) }, admin: actor, body: { qualificationVerified: true, professional: 'pass', communication: 'pass', ethics: 'pass', evidence: '合成核验记录' } }, screeningResponse);
      assert.equal(screeningResponse.statusCode, 200);
      const approve = handler('post', '/admin/:id/approve');
      const screenedRow = await Recruitment.findById(row._id);
      screenedRow.response.departmentName = '神经内科';
      await screenedRow.save();
      const mismatched = response();
      await approve({ params: { id: String(row._id) }, admin: actor, body: { institutionId: String(institutionId), departmentId: String(departmentId), linkedStaffId: String(staffId), singleFee: 180 } }, mismatched);
      assert.equal(mismatched.statusCode, 409);
      screenedRow.response.departmentName = '合成科室';
      await screenedRow.save();
      const wrongDepartment = response();
      await approve({ params: { id: String(row._id) }, admin: actor, body: { institutionId: String(institutionId), departmentId: String(wrongDepartmentId), linkedStaffId: String(staffId), singleFee: 180 } }, wrongDepartment);
      assert.equal(wrongDepartment.statusCode, 409);
      const approved = response();
      await approve({ params: { id: String(row._id) }, admin: actor, body: { institutionId: String(institutionId), departmentId: String(departmentId), linkedStaffId: String(staffId), singleFee: 180 } }, approved);
      assert.equal(approved.statusCode, 200, JSON.stringify(approved.body));
      const profile = await MedicalExpert.findById(approved.body.data.expertProfileId);
      assert.equal(String(profile.tenantId), String(firstTenant));
      assert.equal(profile.teamEligible, true);
      assert.equal(profile.singleConsultationFee, 180);
      const saved = await Recruitment.findById(row._id);
      assert.equal(saved.status, 'approved');
    });
    let reusableToken, linkId;
    await asTenant(firstTenant, async () => {
      const createLink = handler('post', '/admin/links');
      const res = response();
      await createLink({ admin: { _id: oid(), role: 'superadmin' }, body: { partnerName: '甲', specialtyTeam: '消化专科' } }, res);
      assert.equal(res.statusCode, 201);
      reusableToken = res.body.data.token;
      linkId = res.body.data.id;
      const listLinks = handler('get', '/admin/links');
      const listed = response(); await listLinks({ admin: { role: 'superadmin' } }, listed);
      assert.equal(listed.body.data[0].token, reusableToken);
    });
    const openLink = handler('get', '/public-link/:token');
    const available = response(); await openLink({ params: { token: reusableToken } }, available);
    assert.equal(available.body.data.status, 'open');
    const submitLink = handler('post', '/public-link/:token');
    for (const [name, phone] of [['甲医生', '13900000001'], ['乙医生', '13900000002']]) {
      const res = response();
      await submitLink({ params: { token: reusableToken }, body: { name, phone, mdt: true, mdtExpectedFee: 190, privacyAcknowledged: true } }, res);
      assert.equal(res.statusCode, 201);
    }
    const duplicate = response();
    await submitLink({ params: { token: reusableToken }, body: { name: '甲医生', phone: '13900000001', mdt: true, mdtExpectedFee: 190, privacyAcknowledged: true } }, duplicate);
    assert.equal(duplicate.statusCode, 409);
    await asTenant(firstTenant, async () => {
      assert.equal(await Recruitment.countDocuments({ linkId }), 2);
      const revoke = handler('post', '/admin/links/:id/revoke');
      const res = response(); await revoke({ params: { id: String(linkId) }, admin: { _id: oid(), role: 'superadmin' } }, res);
      assert.equal(res.body.data.status, 'revoked');
    });
    const revoked = response(); await openLink({ params: { token: reusableToken } }, revoked);
    assert.equal(revoked.statusCode, 404);
    await asTenant(secondTenant, async () => {
      assert.equal(await RecruitmentLink.countDocuments(), 0);
      assert.equal(await Recruitment.countDocuments({ linkId }), 0);
    });
  });
