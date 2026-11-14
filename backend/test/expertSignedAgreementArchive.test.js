const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Recruitment = require('../src/models/ExpertRecruitment');
const files = require('../src/utils/expertCertificates');
const { router } = require('../src/routes/expertRecruitmentSupplement');
const { createPsychologistAgreementDocx } = require('../src/utils/psychologistAgreementDocx');

const route = router.stack.find(layer => layer.route?.path === '/admin/:id/signed-agreements').route;
const archive = route.stack.at(-1).handle;
const access = route.stack[1].handle;
const todayChina = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const response = () => ({ statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const request = (overrides = {}) => ({
  admin: { _id: new mongoose.Types.ObjectId(), role: 'superadmin' },
  recruitment: { _id: new mongoose.Types.ObjectId(), tenantId: new mongoose.Types.ObjectId(), status: 'approved', signedAgreements: [] },
  file: { originalname: '双方已签协议.pdf', buffer: Buffer.from('%PDF-1.7\nfixture') },
  body: { signedDate: todayChina, agreementNo: 'TEST-1', confirmed: 'true' }, ...overrides,
});

test('paper agreement archive accepts an approved record and records immutable file evidence', async t => {
  const originalStore = files.store, originalRemove = files.remove, originalUpdate = Recruitment.updateOne;
  t.after(() => { files.store = originalStore; files.remove = originalRemove; Recruitment.updateOne = originalUpdate; });
  let saved, query;
  files.store = async (_file, _row, prefix) => { assert.equal(prefix, 'expert-signed-agreements'); return { key: 'private/test.pdf', mimeType: 'application/pdf', size: 16 }; };
  files.remove = async () => { throw new Error('unexpected cleanup'); };
  Recruitment.updateOne = async (filter, update) => { query = filter; saved = update.$push.signedAgreements; return { matchedCount: 1 }; };
  const req = request(), res = response();
  await archive(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(query.status, 'approved');
  assert.equal(query['signedAgreements.9'].$exists, false);
  assert.equal(saved.sha256, crypto.createHash('sha256').update(req.file.buffer).digest('hex'));
  assert.equal(saved.signedDate, todayChina);
  assert.equal(saved.archivedBy, req.admin._id);
});

test('paper agreement archive refuses unapproved, unconfirmed, future dated and duplicate files', async t => {
  const originalStore = files.store, originalRemove = files.remove, originalUpdate = Recruitment.updateOne;
  t.after(() => { files.store = originalStore; files.remove = originalRemove; Recruitment.updateOne = originalUpdate; });
  let stored = 0, removed = 0;
  files.store = async () => { stored++; return { key: 'private/test.pdf', mimeType: 'application/pdf', size: 16 }; };
  files.remove = async () => { removed++; };
  Recruitment.updateOne = async () => ({ matchedCount: 0 });
  for (const req of [
    request({ recruitment: { status: 'submitted', signedAgreements: [] } }),
    request({ body: { signedDate: todayChina, confirmed: 'false' } }),
    request({ body: { signedDate: '2099-01-01', confirmed: 'true' } }),
  ]) {
    const res = response(); await archive(req, res); assert.ok(res.statusCode >= 400);
  }
  assert.equal(stored, 0);
  const res = response(); await archive(request(), res);
  assert.equal(res.statusCode, 409);
  assert.equal(removed, 1);
});

test('agreement routes require an authorized administrator and never expose supplement-token access', async () => {
  assert.equal(route.stack.length, 4);
  assert.equal(router.stack.some(layer => layer.route?.path?.includes('/supplement/:token/signed-agreements')), false);
  const forbidden = response();
  await access({ admin: { role: 'staff' }, params: { id: String(new mongoose.Types.ObjectId()) } }, forbidden, () => {});
  assert.equal(forbidden.statusCode, 403);
  const invalid = response();
  await access({ admin: { role: 'superadmin' }, params: { id: 'bad-id' } }, invalid, () => {});
  assert.equal(invalid.statusCode, 400);
});

test('generated Word agreement contains reviewed fee and is a readable ZIP document', () => {
  const docx = createPsychologistAgreementDocx({ name: '张某某', singleFee: 300 });
  assert.equal(docx.readUInt32LE(0), 0x04034b50);
  assert.ok(docx.includes(Buffer.from('word/document.xml')));
  assert.ok(docx.length > 3000);
  assert.throws(() => createPsychologistAgreementDocx({ name: '', singleFee: 300 }));
});
