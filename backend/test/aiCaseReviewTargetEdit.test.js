const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');
const start = source.indexOf("router.patch('/patients/:patientId/ai-case-reviews/:topicId'");
const end = source.indexOf("router.delete('/patients/:patientId/ai-case-reviews/:topicId'", start);

function setup() {
  let handler;
  const topic = { _id: 'topic', annualPlanYear: 2026, generation: {}, title: '年度综合研判',
    conclusion: { status: 'confirmed', content: '已确认结论', managementTargets: [{ goal: '旧目标', focus: '旧重点', nutritionRelevant: false }],
      confirmedBy: 'old-staff', confirmedByName: '原顾问', confirmedAt: new Date('2026-09-01'), targetChangeNote: '' },
    conclusionHistory: [], save: async () => {},
  };
  vm.runInNewContext(source.slice(start, end), {
    router: { patch(_path, _auth, fn) { handler = fn; } }, staffAuth() {},
    caseReviewPatientOr404: async () => ({ _id: 'patient' }),
    AiCaseReview: { findOne: async () => topic },
    VALID_REVIEW_TYPES: new Set(), sanitizeScopes: value => value,
    require: name => name === '../utils/caseReviewManagementTargets'
      ? require('../src/utils/caseReviewManagementTargets') : require(name),
    forClient: value => value, Date, JSON,
  });
  return { handler, topic };
}

const request = { params: { topicId: 'topic' }, staff: { _id: 'advisor', name: '新顾问', role: 'familyDoctor' },
  body: { managementTargets: [{ goal: '新目标', focus: '新重点', nutritionRelevant: true }] } };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('confirmed goals need a reason before a customer communication change', async () => {
  const { handler, topic } = setup();
  const res = response();
  await handler(request, res);
  assert.equal(res.code, 400);
  assert.equal(topic.conclusion.managementTargets[0].goal, '旧目标');
});

test('advisor can revise confirmed annual goals while retaining the previous version', async () => {
  const { handler, topic } = setup();
  const res = response();
  await handler({ ...request, body: { ...request.body, targetChangeNote: '已与客户沟通，调整本年目标' } }, res);
  assert.equal(res.code, 200);
  assert.equal(topic.conclusion.managementTargets[0].goal, '新目标');
  assert.equal(topic.conclusion.targetChangeNote, '已与客户沟通，调整本年目标');
  assert.equal(topic.conclusionHistory[0].managementTargets[0].goal, '旧目标');
  assert.equal(topic.conclusion.confirmedByName, '新顾问');
});
