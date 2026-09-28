const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('rejected duplicate requests cannot release the running generation lock', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const start = source.indexOf('const activeAIHealthSummaryJobs = new Set();');
  const end = source.indexOf('// 单项重新生成', start);
  let handler, finish, calls = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const user = { _id: 'member', aiHealthSummary: {} };
  const query = { populate() { return this; }, then(resolve) { return Promise.resolve(user).then(resolve); } };
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_path, _auth, callback) { handler = callback; } }, staffAuth: () => {},
    User: { findById: () => query }, DOCTOR_KEYS: ['medical_priority'], LIFESTYLE_KEY: 'lifestyle_assessment',
    generateHealthSummarySections: async () => { calls++; return pending; },
    require: name => {
      if (name.endsWith('packageFeatureEntitlements')) return { getAiEntitlements: async () => ({ aiHealthAnalysis: true }) };
      if (name.endsWith('serviceAccess')) return { resolveServiceAccess: async () => ({}) };
      if (name.endsWith('reportAuditGate')) return { checkReportAuditGate: async () => null };
      throw new Error(name);
    },
  });
  const req = { params: { id: 'member' }, body: { scope: 'doctor', year: '2026' }, staff: { role: 'familyDoctor' } };
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const first = response();
  const running = handler(req, first);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  for (let i = 0; i < 3; i++) {
    const duplicate = response(); await handler(req, duplicate);
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.body.generationInProgress, true);
    assert.equal(calls, 1);
  }
  finish({ failed: true }); await running;
  assert.equal(first.statusCode, 500);
  await handler(req, response());
  assert.equal(calls, 2, 'owner releases the lock after failure so an explicit retry can run');
});

test('gateway HTML timeout produces a readable error and preserves prerequisite flags', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../staff/src/api.js'), 'utf8');
  const code = source.slice(source.indexOf('async function req('), source.indexOf('\nconst qs'));
  let reply;
  const context = { BASE: '', getToken: () => '', FormData: class {}, fetch: async () => reply };
  vm.createContext(context); vm.runInContext(code, context);
  reply = { status: 504, ok: false, json: async () => { throw new SyntaxError('HTML'); } };
  await assert.rejects(context.req('/test'), error => error.status === 504 && /等待超时/.test(error.message));
  reply = { status: 403, ok: false, json: async () => ({ message: '先审核', needReportAudit: true }) };
  await assert.rejects(context.req('/test'), error => error.needReportAudit === true);
});
