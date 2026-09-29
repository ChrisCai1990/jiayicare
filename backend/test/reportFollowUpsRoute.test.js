const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Draft = require('../src/models/ReportFollowUpDraft');
const User = require('../src/models/User');
const FollowUp = require('../src/models/FollowUp');
const workflow = require('../src/utils/reportFollowUpAutomation');
const ids = { draft: '000000000000000000000001', patient: '000000000000000000000002', advisor: '000000000000000000000003' };
let actor = { _id: ids.advisor, role: 'familyDoctor' }, visible = [ids.patient];
const auth = require.resolve('../src/middleware/staffAuth'); require(auth);
require.cache[auth].exports = (req, res, next) => { req.staff = actor; next(); };
const router = require('../src/routes/reportFollowUps')({ getVisiblePlanPatientIds: async () => visible });
const row = patch => ({ _id: ids.draft, patientId: ids.patient, __v: 0, status: 'advisor_review', followUpAutomation: { status: 'ready' }, followUpDrafts: [], ...patch });
async function request(t, body) {
  const app = express(); app.use(express.json()); app.use(router);
  const server = await new Promise(resolve => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/${ids.draft}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test('问题确认仅存年度依据，零执行派单，旧发布入口拒绝', async t => {
  actor = { _id: ids.advisor, role: 'familyDoctor' }; visible = [ids.patient];
  const issues = [{ id: 'item:gastric', title: '胃镜异常', evidence: '原文胃炎', advisorRecommendation: '' }];
  let current = row({ purpose: 'annual_report_input', issueDrafts: issues });
  t.mock.method(Draft, 'findById', async () => current);
  t.mock.method(workflow, 'assertReportDraftSource', async () => {});
  t.mock.method(workflow, 'completeReportReview', async () => {});
  t.mock.method(Draft, 'findOneAndUpdate', async (query, update) => { assert.equal(query.__v, 0); current = { ...current, ...update.$set, __v: 1 }; return current; });
  t.mock.method(FollowUp, 'updateOne', async () => { throw Error('不应派发执行任务'); });
  assert.equal((await request(t, { action: 'approve', revision: 0 })).status, 409);
  assert.equal((await request(t, { action: 'confirm_issues', revision: 0, issueDrafts: issues })).status, 409);
  const result = await request(t, { action: 'confirm_issues', revision: 0, coverageReviewed: true, issueDrafts: [{ ...issues[0], evidence: '篡改', advisorRecommendation: '结合原报告补充评估' }] });
  assert.equal(result.status, 200); assert.equal(result.body.data.followUpPublication.status, 'annual_input');
  assert.equal(result.body.data.issueDrafts[0].evidence, '原文胃炎');
});

test('待判断资料不能静默确认，顾问可逐项标为无需跟进并留审计', async t => {
  actor = { _id: ids.advisor, role: 'familyDoctor' }; visible = [ids.patient];
  let current = row({ purpose: 'annual_report_input', issueDrafts: [], issueSources: [{ id: 'u', name: '资料', evidence: '原文', status: 'unknown' }], issueCoverage: [{ sourceId: 'u', status: 'pending' }] });
  t.mock.method(Draft, 'findById', async () => current);
  t.mock.method(workflow, 'assertReportDraftSource', async () => {});
  t.mock.method(workflow, 'syncReportReviewTask', async () => {});
  t.mock.method(Draft, 'findOneAndUpdate', async (query, update) => { assert.equal(update.$push.auditLog.coverageDecisions.u, 'normal'); current = { ...current, ...update.$set }; return current; });
  assert.equal((await request(t, { action: 'confirm_issues', revision: 0, coverageReviewed: true, issueDrafts: [] })).status, 409);
  const result = await request(t, { action: 'resolve_coverage', revision: 0, issueDrafts: [], coverageDecisions: { u: 'normal' } });
  assert.equal(result.status, 200); assert.equal(result.body.data.issueCoverage[0].status, 'normal'); assert.equal(result.body.data.issueDrafts.length, 0);
});
test('非顾问及无客户权限不能审核报告草稿', async t => {
  actor = { _id: ids.advisor, role: 'healthManager' }; visible = [ids.patient];
  t.mock.method(Draft, 'findById', async () => row());
  assert.equal((await request(t, { action: 'approve' })).status, 403);
  actor = { _id: ids.advisor, role: 'familyDoctor' }; visible = [];
  assert.equal((await request(t, { action: 'approve' })).status, 403);
});
test('旧版本、未生成完草稿及失效来源都不能发布', async t => {
  actor = { _id: ids.advisor, role: 'familyDoctor' }; visible = [ids.patient];
  let current = row();
  t.mock.method(Draft, 'findById', async () => current);
  t.mock.method(workflow, 'assertReportDraftSource', async () => {});
  assert.equal((await request(t, { action: 'approve', revision: 9 })).status, 409);
  for (const status of ['queued', 'running', 'failed']) {
    current = row({ followUpAutomation: { status } });
    assert.equal((await request(t, { action: 'approve', revision: 0 })).status, 409);
  }
  current = row();
  t.mock.method(workflow, 'assertReportDraftSource', async () => { throw Object.assign(Error('来源变更'), { statusCode: 409 }); });
  assert.equal((await request(t, { action: 'approve', revision: 0, followUpDrafts: [] })).status, 409);
});
test('失败草稿可由顾问原子接管，保留审计且不发布任务', async t => {
  actor = { _id: ids.advisor, role: 'familyDoctor' }; visible = [ids.patient];
  t.mock.method(Draft, 'findById', async () => row({ followUpAutomation: { status: 'failed' } }));
  t.mock.method(workflow, 'assertReportDraftSource', async () => {});
  t.mock.method(workflow, 'syncReportReviewTask', async () => {});
  t.mock.method(Draft, 'findOneAndUpdate', async (q, u) => { assert.equal(q.__v, 0); assert.equal(u.$push.auditLog.action, 'take_over'); assert.equal(u.$set['followUpAutomation.status'], 'ready'); return row({ __v: 1 }); });
  assert.equal((await request(t, { action: 'take_over', revision: 0 })).status, 200);
});
test('发布失败保留已批准快照，重试忽略客户端替换内容', async t => {
  actor = { _id: ids.advisor, role: 'familyDoctor' }; visible = [ids.patient];
  let current = row(); let assigned = false; const titles = [];
  const drafts = [{ title: '原批准任务', content: '沟通落实', date: '2099-01-01', category: 'information', requiresService: false }];
  t.mock.method(Draft, 'findById', async () => current);
  t.mock.method(workflow, 'assertReportDraftSource', async () => {});
  t.mock.method(workflow, 'completeReportReview', async () => {});
  t.mock.method(Draft, 'findOneAndUpdate', async (q, u) => { current = { ...current, ...u.$set, __v: 1 }; return current; });
  t.mock.method(Draft, 'updateOne', async (q, u) => { current = { ...current, ...u.$set }; });
  t.mock.method(Draft, 'findByIdAndUpdate', async (id, u) => { current = { ...current, ...u.$set }; return current; });
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: ids.patient, assignedHealthManager: assigned ? 'manager' : null }) }) }));
  t.mock.method(FollowUp, 'updateOne', async (q, u) => { titles.push(u.$setOnInsert.theme); return { upsertedCount: 1 }; });
  const first = await request(t, { action: 'approve', revision: 0, followUpDrafts: drafts });
  assert.equal(first.body.data.status, 'approved'); assert.equal(first.body.data.followUpPublication.status, 'failed');
  assigned = true;
  const retry = await request(t, { action: 'approve', followUpDrafts: [{ title: '不可覆盖' }] });
  assert.equal(retry.body.data.followUpPublication.status, 'published'); assert.deepEqual(titles, ['原批准任务']);
});
