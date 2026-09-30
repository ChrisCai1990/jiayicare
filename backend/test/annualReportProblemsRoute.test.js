const test = require('node:test'), assert = require('node:assert/strict'), express = require('express');
const Model = require('../src/models/AnnualReportProblemReview');
const service = require('../src/utils/annualReportProblems');
const patient = '000000000000000000000002', advisor = '000000000000000000000003';
let actor = { _id: advisor, role: 'familyDoctor' }, visible = [patient];
const auth = require.resolve('../src/middleware/staffAuth'); require(auth);
require.cache[auth].exports = (req, res, next) => { req.staff = actor; next(); };
const router = require('../src/routes/reportFollowUps')({ getVisiblePlanPatientIds: async () => visible });
const topic = { id: 'metabolic', title: '代谢管理', analysis: '合并两处脂肪肝及血脂结果。', recommendation: '核对既往结果并评估生活方式。', reviewed: false, findings: [{ id: 'ct', title: '脂肪肝', sources: [] }] };
const context = { sourceFingerprint: 'current', reports: [{ _id: 'report' }], summary: null, priorAdvice: [] };
async function client(t) {
  const app = express(); app.use(express.json()); app.use(router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return async (action = '', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/patients/${patient}/annual-problems/2026${action}`, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
}
function mockStore(t, initial) {
  let row = structuredClone(initial);
  t.mock.method(Model, 'findOne', () => ({ lean: async () => structuredClone(row) }));
  t.mock.method(Model, 'findOneAndUpdate', (query, update) => ({ lean: async () => {
    if (update.$setOnInsert) { row ||= { _id: 'review', ...update.$setOnInsert, topics: [], history: [] }; return structuredClone(row); }
    if (query.__v !== row.__v || (query.status && query.status !== row.status)) return null;
    row = { ...row, ...update.$set, __v: row.__v + 1, history: [...(row.history || []), ...(update.$push ? [update.$push.history] : [])] };
    return structuredClone(row);
  } }));
  return () => row;
}
test('综合审核接口验证权限、来源版本及逐项审核，客户端不能替换依据', async t => {
  actor = { _id: advisor, role: 'familyDoctor' }; visible = [patient];
  const current = mockStore(t, { _id: 'review', patientId: patient, year: 2026, __v: 2, status: 'ready', sourceFingerprint: 'current', topics: [topic] });
  let fingerprint = 'current';
  t.mock.method(service, 'loadContext', async () => ({ ...context, sourceFingerprint: fingerprint }));
  const call = await client(t);
  actor.role = 'healthManager'; assert.equal((await call('/review', { action: 'approve' })).status, 403);
  actor.role = 'familyDoctor'; visible = []; assert.equal((await call()).status, 403); visible = [patient];
  const body = { action: 'approve', revision: 2, topics: [{ ...topic, reviewed: true, findings: [] }], coverageReviewed: true };
  assert.equal((await call('/review', { ...body, revision: 1 })).status, 409);
  fingerprint = 'changed'; assert.equal((await call('/review', body)).status, 409); fingerprint = 'current';
  assert.equal((await call('/review', { ...body, topics: [topic] })).status, 400);
  const approved = await call('/review', body);
  assert.equal(approved.status, 200); assert.equal(approved.body.data.status, 'approved');
  assert.equal(approved.body.data.topics[0].findings.length, 1);
  assert.equal(current().reviewedBy, advisor); assert.equal(current().history.length, 1);
  assert.equal((await call('/review', body)).status, 409);
});
test('生成异步202、防重复；超时重试换令牌保留历史且旧版本不能覆盖', async t => {
  actor = { _id: advisor, role: 'familyDoctor' }; visible = [patient];
  const current = mockStore(t, { _id: 'review', patientId: patient, year: 2026, __v: 2, status: 'approved', topics: [topic] });
  t.mock.method(service, 'loadContext', async () => context);
  let calls = 0; t.mock.method(service, 'generate', async () => { calls++; });
  const call = await client(t);
  const result = await call('/generate', { revision: 2 });
  assert.equal(result.status, 202); assert.equal(result.body.data.status, 'generating');
  assert.equal((await call('/generate', { revision: 3 })).status, 409);
  assert.equal((await call('/generate', { revision: 2 })).status, 409);
  const token = current().generationToken;
  current().startedAt = new Date(Date.now() - 16 * 60 * 1000);
  const retry = await call('/generate', { revision: 3 });
  assert.equal(retry.status, 202); assert.notEqual(retry.body.data.generationToken, token);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2);
  assert.equal(current().history.length, 2);
});
test('年度输入使用已审核综合主题，未审核及失效来源拒绝引用', async t => {
  const Report = require('../src/models/MedicalReport'), Summary = require('../src/models/ScreeningYearSummary'), Draft = require('../src/models/ReportFollowUpDraft');
  const report = { _id: 'r', reportYear: 2026, title: '报告', reportItems: [{ name: '肝脏', findings: '脂肪肝' }] };
  const fingerprint = service.buildContext([report], null, []).sourceFingerprint;
  const current = mockStore(t, { _id: 'review', patientId: patient, year: 2026, status: 'ready', sourceFingerprint: fingerprint, topics: [{ ...topic, reviewed: true }] });
  t.mock.method(Report, 'find', () => ({ sort: () => ({ lean: async () => [report] }) }));
  t.mock.method(Summary, 'findOne', () => ({ lean: async () => null }));
  t.mock.method(Draft, 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
  await assert.rejects(service.annualEvidence(patient, 2026), /先审核/);
  current().status = 'approved';
  const evidence = await service.annualEvidence(patient, 2026);
  assert.equal(evidence.length, 1); assert.match(evidence[0].id, /^annual_problem:/);
  assert.equal(evidence[0].content.analysis, topic.analysis);
  report.reportItems[0].findings = '新结果'; await assert.rejects(service.annualEvidence(patient, 2026), /来源已更新/);
});
