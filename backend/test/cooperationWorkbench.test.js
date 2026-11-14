const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { adminRouter, staffRouter, marketRouter } = require('../src/routes/cooperationWorkbench');
const Agreement = require('../src/models/CooperationAgreement');
const ProfessionalTeam = require('../src/models/CooperationProfessionalTeam');
const files = require('../src/utils/expertCertificates');

const oid = () => new mongoose.Types.ObjectId();
const handler = (router, path, method = 'get') => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ code: 200, body: null, status(value) { this.code = value; return this; },
  json(value) { this.body = value; return this; }, set() { return this; } });

test('only institution superadmin can use shared paper agreement archive', () => {
  const guard = adminRouter.stack.filter(layer => !layer.route)[1].handle;
  const denied = response();
  guard({ admin: { role: 'manager' } }, denied, () => assert.fail('manager reached archive'));
  assert.equal(denied.code, 403);
  let next = false;
  guard({ admin: { role: 'superadmin' } }, response(), () => { next = true; });
  assert.equal(next, true);
});

test('partner file lookup is bound to login identity and tenant', async t => {
  const original = Agreement.findOne;
  t.after(() => { Agreement.findOne = original; });
  let query;
  Agreement.findOne = filter => { query = filter; return { select: async () => null }; };
  const ownId = oid(), tenantId = oid(), res = response();
  await handler(marketRouter, '/files/:fileId')({ marketPartner: { _id: ownId, tenantId }, params: { fileId: String(oid()) } }, res);
  assert.equal(res.code, 404);
  assert.equal(String(query.tenantId), String(tenantId));
  assert.equal(query.subjectType, 'marketPartner');
  assert.equal(String(query.subjectId), String(ownId));
});

test('staff file lookup permits self and active team representative only', async t => {
  const originalFind = Agreement.findOne, originalTeams = ProfessionalTeam.find;
  t.after(() => { Agreement.findOne = originalFind; ProfessionalTeam.find = originalTeams; });
  const ownId = oid(), teamId = oid(), tenantId = oid();
  let teamQuery, agreementQuery;
  ProfessionalTeam.find = filter => { teamQuery = filter; return { select: () => ({ lean: async () => [{ _id: teamId }] }) }; };
  Agreement.findOne = filter => { agreementQuery = filter; return { select: async () => null }; };
  const res = response();
  await handler(staffRouter, '/files/:fileId')({ staff: { _id: ownId, tenantId }, params: { fileId: String(oid()) } }, res);
  assert.equal(res.code, 404);
  assert.equal(String(teamQuery.authorizedRepresentativeStaffId), String(ownId));
  assert.equal(teamQuery.status, 'active');
  assert.equal(String(teamQuery.tenantId), String(tenantId));
  assert.equal(String(agreementQuery.$or[0].subjectId), String(ownId));
  assert.equal(String(agreementQuery.$or[1].subjectId.$in[0]), String(teamId));
});

test('archive validates hand signature and records private immutable file metadata', async t => {
  const originals = [Agreement.exists, Agreement.create, ProfessionalTeam.findOne, files.fileType, files.store];
  t.after(() => { [Agreement.exists, Agreement.create, ProfessionalTeam.findOne, files.fileType, files.store] = originals; });
  const subjectId = oid(), tenantId = oid(), adminId = oid();
  ProfessionalTeam.findOne = () => ({ select: () => ({ lean: async () => ({ _id: subjectId, name: '测试团队', creditCode: '91330109MA2CDMRE9E', authorizedRepresentativeStaffId: oid(), representativeVerifiedAt: new Date() }) }) });
  Agreement.exists = async () => null;
  files.fileType = () => ({ mimeType: 'application/pdf', ext: 'pdf' });
  files.store = async () => ({ key: 'cooperation-agreements/private.pdf', mimeType: 'application/pdf', size: 10 });
  let saved;
  Agreement.create = async value => { saved = value; return { _id: oid(), ...value, archivedAt: new Date() }; };
  const req = { admin: { _id: adminId, role: 'superadmin', tenantId },
    params: { type: 'professionalTeam', subjectId: String(subjectId) },
    file: { originalname: '已签协议.pdf', buffer: Buffer.from('%PDF-1.7\n') },
    body: { title: '专业团队合作协议', signedDate: '2026-11-14', effectiveAt: '', expiresAt: '', confirmed: 'false' } };
  const archive = handler(adminRouter, '/:type/:subjectId', 'post');
  const denied = response(); await archive(req, denied); assert.equal(denied.code, 400);
  const accepted = response(); req.body.confirmed = 'true'; await archive(req, accepted);
  assert.equal(accepted.code, 201);
  assert.equal(saved.subjectType, 'professionalTeam');
  assert.equal(String(saved.tenantId), String(tenantId));
  assert.equal(String(saved.archivedBy), String(adminId));
  assert.equal(JSON.stringify(accepted.body).includes('cooperation-agreements/private.pdf'), false);
  assert.equal(JSON.stringify(accepted.body).includes(saved.sha256), false);
});
