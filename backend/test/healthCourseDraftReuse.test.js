const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const start = source.indexOf("router.post('/medical-reports/:id/health-course-draft'");
const end = source.indexOf("router.put('/medical-reports/:id/health-course-draft'", start);

test('opening an existing outpatient draft preserves its reviewed version', async () => {
  let handler;
  let generated = 0;
  const draft = { status: 'pending_review', generatedAt: new Date('2026-08-30T13:00:00Z'), content: '已核对的原病历内容' };
  const report = { _id: 'report', user: 'patient', documentCategory: 'outpatient_record',
    audit_status: 'audited', courseTargetDiseaseId: 'dossier', healthCourseDraft: draft };
  vm.runInNewContext(source.slice(start, end), {
    router: { post: (_path, _auth, callback) => { handler = callback; } },
    staffAuth: () => {},
    MedicalReport: { findById: async () => report },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ diseaseRecords: [] }) }) }) },
    getVisiblePlanPatientIds: async () => ['patient'],
    normalizedDiseaseRecords: patient => patient.diseaseRecords,
    findReportArchive: () => null,
    HEALTH_COURSE_DOCUMENTS: new Set(['outpatient_record']),
    generateHealthCourseDraft: async () => { generated++; return { status: 'pending_review' }; },
    require: () => ({ hasOutpatientRecordContent: () => false }),
  });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'report' }, body: {}, staff: { role: 'familyDoctor', _id: 'advisor' } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data, draft);
  assert.equal(generated, 0);
});
