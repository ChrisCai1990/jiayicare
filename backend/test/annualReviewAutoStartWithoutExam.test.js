const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('annual review can start from reviewed concerns when no audited physical exam exists', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');
  const start = source.indexOf("router.post('/patients/:patientId/ai-case-reviews/:topicId/messages'");
  const end = source.indexOf("router.patch('/patients/:patientId/ai-case-reviews/:topicId/messages/:messageId'", start);
  let handler, accepted;
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_path, _auth, fn) { handler = fn; } }, staffAuth() {},
    caseReviewPatientOr404: async () => ({ _id: 'patient' }),
    AiCaseReview: { findOne: async () => ({ reviewType: 'annual', messages: [], contextScopes: ['reports'] }) },
    latestExam: async () => null,
    acceptSend: async (_model, args) => { accepted = args; return { topic: { _id: 'annual', generation: { status: 'running' } }, claimed: true }; },
    finishSend: () => Promise.resolve(), forClient: value => value,
    ROLE_LABEL: { familyDoctor: '健康顾问' }, AUTO_REVIEW_MESSAGE: '自动研判',
    console,
  });
  const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ staff: { _id: 'advisor', role: 'familyDoctor', name: '顾问' }, params: { topicId: 'annual' }, body: { autoStart: true, requestId: 'auto_annual_review_2026' } }, response);
  assert.equal(response.code, 202);
  assert.equal(accepted.content, '自动研判');
});
