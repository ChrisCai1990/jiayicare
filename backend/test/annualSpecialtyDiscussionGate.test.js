const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('customer discussion waits when a single-issue conclusion is newer than the annual conclusion', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');
  const start = source.indexOf("router.post('/patients/:patientId/ai-case-reviews/:topicId/customer-discussion'");
  const end = source.indexOf('\nmodule.exports = router;', start);
  let handler;
  let queries = 0;
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_path, _auth, fn) { handler = fn; } }, staffAuth() {}, Date,
    caseReviewPatientOr404: async () => ({ _id: 'patient' }),
    AiCaseReview: { findOne(query) {
      queries += 1;
      if (queries === 1) return Promise.resolve({ reviewType: 'annual', annualPlanYear: 2026, conclusion: { status: 'confirmed', confirmedAt: new Date('2026-10-03T04:00:00Z') } });
      assert.equal(query.reviewType, 'specialty');
      assert.equal(query['conclusion.status'], 'confirmed');
      return { select() { return { lean: async () => ({ title: '肺结节专项研判' }) }; } };
    } },
  });
  const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ staff: { role: 'familyDoctor' }, params: { topicId: 'annual' }, body: {} }, response);
  assert.equal(response.code, 409);
  assert.match(response.body.message, /肺结节/);
  assert.equal(queries, 2);
});
