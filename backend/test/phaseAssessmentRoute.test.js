const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const User = require('../src/models/User');
const PhaseAssessment = require('../src/models/PhaseAssessment');
const ServiceRecord = require('../src/models/ServiceRecord');
const ids = { patient: '000000000000000000000001', reviewer: '000000000000000000000002', assessment: '000000000000000000000003' };
let actor;
const auth = require.resolve('../src/middleware/staffAuth'); require(auth);
require.cache[auth].exports = (req, res, next) => { req.staff = actor; next(); };
const router = require('../src/routes/aiCaseReviews');
async function request(t, body) {
  const app = express(); app.use(express.json()); app.use(router);
  const server = await new Promise(resolve => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/patients/${ids.patient}/phase-assessments/${ids.assessment}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
function setup(t, role = 'rehabSpecialist', patch = {}) {
  actor = { _id: ids.reviewer, role };
  const fields = { rehabSpecialist: 'assignedRehabSpecialist', familyDoctor: 'assignedFamilyDoctor', nutritionist: 'assignedNutritionist' };
  const row = { _id: ids.assessment, patientId: ids.patient, __v: 0, primaryReviewRole: role, status: role === 'familyDoctor' ? 'doctor_review' : 'professional_review', content: '作息较规律', auditLog: [], save: async () => {}, ...patch };
  t.mock.method(User, 'findById', async () => ({ _id: ids.patient, [fields[role]]: ids.reviewer, aiPilotFeatures: { stageAssessment: true } }));
  t.mock.method(PhaseAssessment, 'findOne', async () => row);
  return row;
}
test('修改后的风险内容触发顾问审核，不提前归档', async t => {
  const row = setup(t);
  t.mock.method(ServiceRecord, 'findOneAndUpdate', async () => assert.fail('不应归档'));
  const res = await request(t, { action: 'approve', revision: 0, content: '血压持续升高，需要就医' });
  assert.equal(res.status, 200); assert.equal(row.status, 'doctor_review'); assert.equal(row.professionalReview.status, 'escalated');
});
test('过期版本及非当前审核岗位不能提交', async t => {
  setup(t);
  assert.equal((await request(t, { action: 'approve', revision: 2 })).status, 409);
  actor.role = 'nutritionist';
  assert.equal((await request(t, { action: 'approve', revision: 0 })).status, 403);
});
test('未绑定客户不能查看或修改评估', async t => {
  setup(t); actor._id = '000000000000000000000009';
  assert.equal((await request(t, { action: 'approve', revision: 0 })).status, 403);
});
test('综合评估由顾问直接确认归档', async t => {
  const row = setup(t, 'familyDoctor'); let archives = 0;
  t.mock.method(ServiceRecord, 'findOneAndUpdate', async () => { archives++; return { _id: 'archive' }; });
  assert.equal((await request(t, { action: 'approve', revision: 0 })).status, 200);
  assert.equal(row.status, 'finalized'); assert.equal(archives, 1);
});
test('顾问退回运动评估仍回到运动岗位', async t => {
  const row = setup(t, 'familyDoctor', { primaryReviewRole: 'rehabSpecialist' });
  assert.equal((await request(t, { action: 'return', revision: 0, reviewNote: '补充依据' })).status, 200);
  assert.equal(row.status, 'professional_review');
});
