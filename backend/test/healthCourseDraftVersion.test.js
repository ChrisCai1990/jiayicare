const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const start = source.indexOf("router.put('/medical-reports/:id/health-course-draft'");
const end = source.indexOf("router.delete('/medical-reports/:id'", start);

test('advisor review accepts the same millisecond-precision draft and rejects a changed one', async () => {
  let handler;
  const generatedAt = new Date('2026-10-22T03:18:15.262Z');
  let saved = 0;
  let report;
  vm.runInNewContext(source.slice(start, end), {
    router: { put: (_path, _auth, callback) => { handler = callback; } },
    staffAuth: () => {},
    MedicalReport: { findById: async () => report },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ diseaseRecords: [] }) }) }) },
    getVisiblePlanPatientIds: async () => null,
    normalizedDiseaseRecords: patient => patient.diseaseRecords,
    findReportArchive: () => null,
  });
  const call = async submittedAt => {
    report = { _id: 'report', user: 'patient', audit_status: 'audited',
      healthCourseDraft: { status: 'pending_review', generatedAt },
      save: async () => { saved++; } };
    const res = { code: 200, status(code) { this.code = code; return this; },
      json(body) { this.body = body; return this; } };
    await handler({ params: { id: 'report' }, body: { action: 'dismiss', generatedAt: submittedAt },
      staff: { role: 'familyDoctor', _id: 'advisor', name: '顾问' } }, res);
    return res;
  };
  assert.equal((await call(generatedAt.toISOString())).code, 200);
  assert.equal(saved, 1);
  assert.equal((await call('2026-10-22T03:18:15.263Z')).code, 409);
  assert.equal(saved, 1);
});
