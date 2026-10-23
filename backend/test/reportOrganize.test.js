const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const patientId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const reportId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const staffId = 'cccccccccccccccccccccccc';
const tenantId = 'dddddddddddddddddddddddd';

function routeFixture({ sourceUser = patientId, copyFails = false, createFails = false } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const snippet = source.split("router.post('/medical-reports/organize'")[1]
    .split('// POST /api/staff/medical-reports — 上传报告')[0];
  let handler;
  let created;
  const copied = [];
  const deleted = [];
  const report = {
    _id: reportId, user: sourceUser, title: '客户原件', type: 'other',
    documentCategory: 'physical_exam', fileUrls: ['https://private/reports/original.pdf'],
    ossKeys: ['reports/original.pdf'], mimeType: 'application/pdf', fileSize: '1024',
  };
  const oss = {
    urlToKey: () => null,
    copyStoredFile: async key => {
      if (copyFails) throw new Error('OSS unavailable');
      copied.push(key);
      return { key: 'reports/copied.pdf', url: 'https://private/reports/copied.pdf' };
    },
    uploadBase64: () => assert.fail('unexpected base64 upload'),
    deleteFile: async key => { deleted.push(key); },
  };
  const context = {
    router: { post: (_url, _auth, _permission, fn) => { handler = fn; } },
    staffAuth: () => {}, checkPermission: () => () => {},
    mongoose: { isValidObjectId: value => /^[a-f0-9]{24}$/.test(String(value)) },
    User: { findOne: () => ({ select: () => ({ lean: async () => ({ _id: patientId, tenantId, assignedHealthManager: staffId }) }) }) },
    MedicalReport: {
      find: async () => sourceUser === patientId ? [report] : [],
      create: async value => { if (createFails) throw new Error('database unavailable'); created = value; return { _id: 'eeeeeeeeeeeeeeeeeeeeeeee', ...value }; },
      schema: { path: field => ({ enumValues: field === 'type' ? ['other'] : ['physical_exam'] }) },
    },
    require: name => { assert.equal(name, '../utils/oss'); return oss; },
    withSignedReportFiles: value => value,
    isCalendarReportDate: () => true,
    console: { error: () => {} },
    Date,
  };
  vm.runInNewContext(`router.post('/medical-reports/organize'${snippet}`, context);
  const invoke = async files => {
    const req = { staff: { _id: staffId, tenantId, role: 'healthManager' }, body: {
      patientId, title: '整理后', type: 'other', documentCategory: 'physical_exam', files,
    } };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
    await handler(req, res);
    return res;
  };
  return { invoke, copied, deleted, get created() { return created; } };
}

test('organizing creates an independent file and records its source', async () => {
  const fixture = routeFixture();
  const result = await fixture.invoke([{ reportId, fileIndex: 0 }]);
  assert.equal(result.code, 200);
  assert.deepEqual(fixture.copied, ['reports/original.pdf']);
  assert.deepEqual(Array.from(fixture.created.ossKeys), ['reports/copied.pdf']);
  assert.equal(String(fixture.created.organizedFrom[0].reportId), reportId);
  assert.equal(fixture.created.audit_status, 'unaudited');
});

test('another customer’s report is rejected before copying', async () => {
  const fixture = routeFixture({ sourceUser: 'ffffffffffffffffffffffff' });
  const result = await fixture.invoke([{ reportId, fileIndex: 0 }]);
  assert.equal(result.code, 400);
  assert.equal(fixture.copied.length, 0);
  assert.equal(fixture.created, undefined);
});

test('duplicate source file is rejected before copying', async () => {
  const fixture = routeFixture();
  const result = await fixture.invoke([{ reportId, fileIndex: 0 }, { reportId, fileIndex: 0 }]);
  assert.equal(result.code, 400);
  assert.equal(fixture.copied.length, 0);
});

test('a failed record write removes the newly copied object', async () => {
  const fixture = routeFixture({ createFails: true });
  const result = await fixture.invoke([{ reportId, fileIndex: 0 }]);
  assert.equal(result.code, 500);
  assert.deepEqual(fixture.deleted, ['reports/copied.pdf']);
});
