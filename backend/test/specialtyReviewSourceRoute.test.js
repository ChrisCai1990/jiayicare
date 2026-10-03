const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('a report issue creates one specialty review with its source and no automatic AI message', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');
  const start = source.indexOf("router.post('/patients/:patientId/ai-case-reviews/specialty-from-source'");
  const end = source.indexOf('\nfunction reopenAfterConcernChange', start);
  let handler, created;
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_path, _auth, fn) { handler = fn; } }, staffAuth() {},
    caseReviewPatientOr404: async () => ({ _id: 'patient', assignedFamilyDoctor: 'advisor' }),
    concernSource: async () => ({ key: 'screening_report:r1', title: '胸部CT', evidence: '双肺微小结节', source: { reportId: 'r1' } }),
    AiCaseReview: { findOne: async () => null, create: async payload => { created = payload; return { _id: 'topic', ...payload }; } },
    forClient: value => value, Date,
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ staff: { _id: 'advisor', role: 'familyDoctor', name: '顾问' }, body: { issueTitle: '肺结节', kind: 'screening_report', reportId: 'r1' }, params: {} }, res);
  assert.equal(res.code, 201);
  assert.equal(created.title, '肺结节专项研判');
  assert.equal(created.sourceLinks[0].source.reportId, 'r1');
  assert.equal(created.messages, undefined);
});
