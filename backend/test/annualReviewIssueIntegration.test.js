const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');
const handlerFor = (route, nextRoute, context) => {
  const start = routeSource.indexOf(`router.post('${route}'`);
  const end = routeSource.indexOf(`router.${nextRoute}`, start + 1);
  assert.ok(start >= 0 && end > start);
  let handler;
  vm.runInNewContext(routeSource.slice(start, end), {
    router: { post(_path, _auth, fn) { handler = fn; } }, staffAuth() {}, ...context,
  });
  return handler;
};
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('screening finding enters annual concern with editable specific issue title', async () => {
  const topic = { concerns: [], generation: {}, customerDiscussionHistory: [], conclusionHistory: [], markModified() {}, async save() {} };
  const handler = handlerFor('/patients/:patientId/ai-case-reviews/:topicId/concerns', 'post', {
    caseReviewPatientOr404: async () => ({ _id: 'patient', assignedFamilyDoctor: 'advisor' }),
    AiCaseReview: { findOne: async () => topic },
    concernSource: async () => ({ key: 'screening:r1:i1', kind: 'screening', title: '胃镜', evidence: '慢性胃炎', source: { reportId: 'r1' } }),
    mongoose: { Types: { ObjectId: class { toString() { return 'concern1'; } } } },
    reopenAfterConcernChange() {}, forClient: value => value, Date, JSON,
  });
  const req = { staff: { _id: 'advisor', role: 'familyDoctor', name: '健康顾问' }, body: { kind: 'screening', issueTitle: '慢性非萎缩性胃炎伴糜烂' }, params: { topicId: 'annual' } };
  const first = response(); await handler(req, first);
  assert.equal(first.code, 201);
  assert.equal(topic.concerns[0].title, '慢性非萎缩性胃炎伴糜烂');
  assert.equal(topic.concerns[0].source.reportId, 'r1');
  const second = response(); await handler(req, second);
  assert.equal(second.body.reused, true);
  assert.equal(topic.concerns.length, 1);
});

test('existing specialty topic can be incorporated once without deleting its history', async () => {
  const topic = { annualPlanYear: 2026, concerns: [], generation: {}, customerDiscussionHistory: [], conclusionHistory: [], markModified() {}, async save() {} };
  const specialty = { _id: 'old-topic', title: '肺结节专项研判', sourceLinks: [{ title: '胸部CT', evidence: '肺部结节', source: { checkDate: '2025-05-01' } }], conclusion: { status: 'confirmed', content: '按期复查' } };
  const handler = handlerFor('/patients/:patientId/ai-case-reviews/:topicId/import-specialty', 'patch', {
    caseReviewPatientOr404: async () => ({ _id: 'patient', assignedFamilyDoctor: 'advisor' }),
    AiCaseReview: { findOne: async () => topic, find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [specialty] }) }) }) },
    mongoose: { Types: { ObjectId: class { toString() { return 'concern1'; } } } },
    reopenAfterConcernChange() {}, forClient: value => value, Date, String,
  });
  const req = { staff: { _id: 'advisor', role: 'familyDoctor' }, body: {}, params: { topicId: 'annual' } };
  const first = response(); await handler(req, first);
  assert.equal(first.body.added, 1);
  assert.equal(topic.concerns[0].title, '肺结节');
  assert.equal(topic.concerns[0].source.topicId, 'old-topic');
  assert.match(topic.concerns[0].note, /按期复查/);
  const second = response(); await handler(req, second);
  assert.equal(second.body.added, 0);
  assert.equal(topic.concerns.length, 1);
});
