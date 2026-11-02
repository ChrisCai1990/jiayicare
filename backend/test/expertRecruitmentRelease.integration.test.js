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
  set() { return this; },
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
    const request = { params: { token }, body: { name: '张医生', phone: '13800000000', institutionName: '合成医院', departmentName: '内分泌代谢科', registrationScope: '内分泌代谢相关疾病，如糖尿病、肥胖、甲状腺疾病、内分泌相关性骨质疏松等疾病的诊治。', singleConsultation: true, singleExpectedFee: 200, privacyAcknowledged: true } };
    request.body.education = '博士研究生';
    const first = response(); await submit(request, first); assert.equal(first.statusCode, 201);
    const second = response(); await submit(request, second); assert.equal(second.statusCode, 409);
    const adminList = handler('get', '/admin');
    await asTenant(firstTenant, async () => {
      const res = response(); await adminList({ admin: { role: 'superadmin' } }, res);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].response.name, '张医生');
      assert.equal(res.body.data[0].response.education, '博士研究生');
    });
    await asTenant(secondTenant, async () => {
      const res = response(); await adminList({ admin: { role: 'superadmin' } }, res);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].candidateName, '李医生');
    });
    const institutionId = oid(), departmentId = oid(), wrongDepartmentId = oid(), staffId = oid();
    await MedicalInstitution.collection.insertOne({ _id: institutionId, tenantId: firstTenant, name: '合成医院', status: 'active' });
    await MedicalDepartment.collection.insertOne({ _id: departmentId, tenantId: firstTenant, institutionId, name: '内分泌代谢科', status: 'active' });
    await MedicalDepartment.collection.insertOne({ _id: wrongDepartmentId, tenantId: firstTenant, institutionId, name: '神经内科', status: 'active' });
    await Admin.collection.insertOne({ _id: staffId, tenantId: firstTenant, name: '张医生', phone: '13800000000', role: 'specialist', staffStatus: 'active' });
    await asTenant(firstTenant, async () => {
      const row = await Recruitment.findOne({ tokenHash: sha(token) });
      const actor = { _id: oid(), tenantId: firstTenant, role: 'superadmin' };
      const screen = handler('patch', '/admin/:id/screening');
      const approve = handler('post', '/admin/:id/approve');
      const unverified = response();
      await approve({ params: { id: String(row._id) }, admin: actor, body: { institutionId: String(institutionId), departmentId: String(departmentId), linkedStaffId: String(staffId), singleFee: 180 } }, unverified);
      assert.equal(unverified.statusCode, 409, '专业描述不做逐字比较，但仍须先人工核验');
      const missingEvidence = response();
      await screen({ params: { id: String(row._id) }, admin: actor, body: { qualificationVerified: true, professional: 'pass', communication: 'pass', ethics: 'pass' } }, missingEvidence);
      assert.equal(missingEvidence.statusCode, 400);
      const screeningResponse = response();
      await screen({ params: { id: String(row._id) }, admin: actor, body: { qualificationVerified: true, professional: 'pass', communication: 'pass', ethics: 'pass', evidence: '合成核验记录' } }, screeningResponse);
      assert.equal(screeningResponse.statusCode, 200);
      const screenedRow = await Recruitment.findById(row._id);
      screenedRow.response.departmentName = '神经内科';
      await screenedRow.save();
      const mismatched = response();
      await approve({ params: { id: String(row._id) }, admin: actor, body: { institutionId: String(institutionId), departmentId: String(departmentId), linkedStaffId: String(staffId), singleFee: 180 } }, mismatched);
      assert.equal(mismatched.statusCode, 409);
      screenedRow.response.departmentName = '内分泌代谢科';
      await screenedRow.save();
      const wrongDepartment = response();
      await approve({ params: { id: String(row._id) }, admin: actor, body: { institutionId: String(institutionId), departmentId: String(wrongDepartmentId), linkedStaffId: String(staffId), singleFee: 180 } }, wrongDepartment);
      assert.equal(wrongDepartment.statusCode, 409);
      const existingProfile = await MedicalExpert.create({ name: '其他医生', institutionId, departmentId,
        linkedStaffId: staffId, introduction: '保留原档案介绍', serviceModes: ['outpatient'], status: 'active' });
      const otherPerson = response();
      await approve({ params: { id: String(row._id) }, admin: actor, body: { institutionId: String(institutionId), departmentId: String(departmentId), linkedStaffId: String(staffId), singleFee: 180 } }, otherPerson);
      assert.equal(otherPerson.statusCode, 409);
      existingProfile.name = '张医生';
      await existingProfile.save();
      const approved = response();
      await approve({ params: { id: String(row._id) }, admin: actor, body: { institutionId: String(institutionId), departmentId: String(departmentId), linkedStaffId: String(staffId), singleFee: 180 } }, approved);
      assert.equal(approved.statusCode, 200, JSON.stringify(approved.body));
      const profile = await MedicalExpert.findById(approved.body.data.expertProfileId);
      assert.equal(String(profile.tenantId), String(firstTenant));
      assert.equal(profile.teamEligible, true);
      assert.equal(profile.singleConsultationFee, 180);
      assert.equal(String(profile._id), String(existingProfile._id), '沿用同一专家的原档案');
      assert.equal(profile.introduction, '保留原档案介绍');
      assert.ok(profile.serviceModes.includes('outpatient'));
      assert.ok(profile.serviceModes.includes('single_consultation'));
      assert.equal(await MedicalExpert.countDocuments({ linkedStaffId: staffId }), 1);
      const saved = await Recruitment.findById(row._id);
      assert.equal(saved.status, 'approved');
      const updateEducation = handler('patch', '/admin/:id/education');
      const educationRequest = { params: { id: String(row._id) }, admin: actor, body: { education: '硕士研究生' } };
      // 模拟上线前没有学历字段的历史问卷，已入库后仍可补填。
      await Recruitment.updateOne({ _id: row._id }, { $unset: { 'response.education': 1 } });
      const forbidden = response();
      await updateEducation({ ...educationRequest, admin: { ...actor, role: 'specialist' } }, forbidden);
      assert.equal(forbidden.statusCode, 403);
      const invalid = response();
      await updateEducation({ ...educationRequest, body: { education: '' } }, invalid);
      assert.equal(invalid.statusCode, 400);
      await asTenant(secondTenant, async () => {
        const foreign = response();
        await updateEducation({ ...educationRequest, admin: { ...actor, tenantId: secondTenant } }, foreign);
        assert.equal(foreign.statusCode, 409);
      });
      const filled = response(); await updateEducation(educationRequest, filled);
      assert.equal(filled.statusCode, 200);
      const edited = response(); await updateEducation({ ...educationRequest, body: { education: '博士研究生', status: 'submitted' } }, edited);
      assert.equal(edited.statusCode, 200);
      const checked = await Recruitment.findById(row._id);
      assert.equal(checked.response.education, '博士研究生');
      assert.equal(checked.status, 'approved');
      assert.equal(checked.educationChanges.length, 2);
      assert.equal(checked.educationChanges[0].before, '');
      assert.equal(checked.educationChanges[1].before, '硕士研究生');
      assert.equal(String(checked.educationChanges[1].updatedBy), String(actor._id));
      assert.equal(String(checked.expertProfileId), String(profile._id));
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
    const otherSupplementTokens = [];
    for (const [name, phone] of [['甲医生', '13900000001'], ['乙医生', '13900000002']]) {
      const res = response();
      await submitLink({ params: { token: reusableToken }, body: { name, phone, mdt: true, mdtExpectedFee: 190, privacyAcknowledged: true } }, res);
      assert.equal(res.statusCode, 201);
      otherSupplementTokens.push(res.body.data.supplementToken);
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
    // Exercise real multipart HTTP routes; private storage is replaced by an in-memory adapter.
    const express = require('express');
    const { Readable } = require('node:stream');
    const supplements = require('../src/routes/expertRecruitmentSupplement').router;
    const storage = require('../src/utils/expertCertificates');
    const originals = { store: storage.store, stream: storage.stream, remove: storage.remove };
    const objects = new Map();
    storage.store = async file => { const key = crypto.randomUUID(); objects.set(key, file.buffer); return { key, mimeType: 'application/pdf', size: file.buffer.length }; };
    storage.stream = async key => ({ stream: Readable.from(objects.get(key)) });
    storage.remove = async key => objects.delete(key);
    t.after(() => Object.assign(storage, originals));
    const app = express(); app.use(express.json()); app.use(supplements);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const supplementToken = first.body.data.supplementToken;
    const url = `${origin}/supplement/${supplementToken}`;
    assert.equal((await fetch(`${origin}/supplement/${token}`)).status, 404, '原邀请链接不能读取个人资料');
    const initialSupplement = await (await fetch(url)).json();
    assert.equal(initialSupplement.data.education, '博士研究生');
    assert.equal(initialSupplement.data.phone, undefined);
    const putLanguages = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ education: '博士研究生', languages: [{ language: '英语', level: 'consultation' }, { language: '日语', level: 'interpreter' }] }) });
    assert.equal(putLanguages.status, 200);
    const invalidLanguages = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ education: '博士研究生', languages: [{ language: '英语', level: 'invalid' }] }) });
    assert.equal(invalidLanguages.status, 400);
    function multipart(content, filename = 'certificate.pdf') { const form = new FormData(); form.append('category', 'qualification'); form.append('file', new Blob([content], { type: 'application/pdf' }), filename); return form; }
    const invalidFile = await fetch(`${url}/certificates`, { method: 'POST', body: multipart('<script>bad</script>') });
    assert.equal(invalidFile.status, 400);
    const pdf = '%PDF-1.4\nsynthetic certificate';
    assert.equal((await fetch(`${url}/certificates`, { method: 'POST', body: multipart(pdf) })).status, 201);
    const uploaded = await (await fetch(url)).json();
    assert.equal(uploaded.data.languages.length, 2);
    assert.equal(uploaded.data.certificates[0].reviewStatus, 'pending');
    assert.equal(uploaded.data.certificates[0].key, undefined);
    const fileId = uploaded.data.certificates[0]._id;
    assert.equal((await fetch(`${origin}/supplement/${otherSupplementTokens[0]}/certificates/${fileId}`)).status, 404, '同一共用链接下其他专家不能读取附件');
    assert.equal(await (await fetch(`${url}/certificates/${fileId}`)).text(), pdf);
    assert.equal((await fetch(`${url}/certificates/${oid()}`)).status, 404);
    assert.equal((await fetch(`${url}/certificates/not-an-id`)).status, 400);
    assert.equal((await fetch(`${url}/certificates`, { method: 'POST', body: multipart(Buffer.alloc(10 * 1024 * 1024 + 1)) })).status, 400);
    async function adminSupplement(method, route, req) {
      const layer = supplements.stack.find(layer => layer.route?.path === route && layer.route.methods[method]);
      const res = response(); let allowed = false;
      await layer.route.stack.find(s => s.handle.name === 'access').handle(req, res, () => { allowed = true; });
      if (allowed) await layer.route.stack.at(-1).handle(req, res);
      return res;
    }
    let rowId, rotated;
    await asTenant(firstTenant, async () => {
      const row = await Recruitment.findOne({ tokenHash: sha(token) }); rowId = String(row._id);
      const admin = { _id: oid(), role: 'superadmin', tenantId: firstTenant };
      const denied = await adminSupplement('post', '/admin/:id/supplement-link', { params: { id: rowId }, admin: { ...admin, role: 'specialist' } });
      assert.equal(denied.statusCode, 403);
      const reviewed = await adminSupplement('patch', '/admin/:id/certificates/:fileId', { params: { id: rowId, fileId }, admin, body: { status: 'pass', note: '已核验合成证书' } });
      assert.equal(reviewed.statusCode, 200);
      const result = await adminSupplement('post', '/admin/:id/supplement-link', { params: { id: rowId }, admin });
      rotated = result.body.data.token;
      const stored = await Recruitment.findById(rowId).lean();
      assert.equal(stored.supplementTokenHash, undefined);
      assert.equal(stored.certificates[0].key, undefined);
    });
    await asTenant(secondTenant, async () => {
      const foreign = await adminSupplement('get', '/admin/:id/qualifications', { params: { id: rowId }, admin: { role: 'superadmin', tenantId: secondTenant } });
      assert.equal(foreign.statusCode, 404);
    });
    assert.equal((await fetch(url)).status, 404, '重新生成后旧个人链接失效');
    const renewed = await (await fetch(`${origin}/supplement/${rotated}`)).json();
    assert.equal(renewed.data.certificates[0].reviewStatus, 'pass');
    await asTenant(firstTenant, () => Recruitment.updateOne({ _id: rowId }, { $set: { supplementExpiresAt: new Date(0) } }));
    assert.equal((await fetch(`${origin}/supplement/${rotated}`)).status, 404);
    await asTenant(secondTenant, async () => {
      assert.equal(await RecruitmentLink.countDocuments(), 0);
      assert.equal(await Recruitment.countDocuments({ linkId }), 0);
    });
  });
