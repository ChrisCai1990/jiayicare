const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalizeClinicalReview } = require('../src/utils/clinicalDocumentReview');

const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const start = source.indexOf("router.put('/patients/:id/disease-records/:recordId/course-entries/:entryId'");
const end = source.indexOf('\nrouter.', start + 1);

async function revise({ content = '原摘要', otherRecordContent = '修正后的处方', matchedCount = 1 } = {}) {
  let handler;
  let write;
  const original = {
    _id: 'entry', sourceReportId: 'original-report', occurredAt: new Date('2026-11-17'), content: '原摘要', symptoms: '',
    examination: '', diagnosis: '', medicationChange: '', treatmentResponse: '', nextPlan: '',
    sourceType: 'medical_record', sourceInstitution: '', sourceDepartment: '', sourceDoctor: '', verificationStatus: 'source_verified',
    outpatientRecord: normalizeClinicalReview('outpatient_record', { otherRecordContent: '原处方', visitDate: '2026-11-17' }),
  };
  const patient = { _id: 'patient', diseaseRecords: [{ _id: 'dossier', courseEntries: [original] }] };
  const stored = structuredClone(patient.diseaseRecords);
  vm.runInNewContext(source.slice(start, end), {
    router: { put: (_path, ...callbacks) => { handler = callbacks.at(-1); } },
    staffAuth: () => {}, checkPermission: () => {},
    User: { findById: () => ({ select: () => ({ lean: async () => patient }) }),
      collection: { updateOne: async (query, update) => { write = { query, update }; return { matchedCount }; } } },
    normalizedDiseaseRecords: value => structuredClone(value.diseaseRecords),
    mergedHealthChange: body => body.content,
    cleanMedicalText: (value, max = 10000) => String(value || '').trim().slice(0, max),
    cleanHealthInfoProvenance: body => ({ sourceType: body.sourceType, sourceInstitution: body.sourceInstitution,
      sourceDepartment: body.sourceDepartment, sourceDoctor: body.sourceDoctor, verificationStatus: body.verificationStatus }),
    require: () => ({ normalizeClinicalReview }),
  });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await handler({ params: { id: 'patient', recordId: 'dossier', entryId: 'entry' },
    staff: { _id: 'staff', name: '医护' },
    body: { occurredAt: '2026-11-17', content, sourceType: 'medical_record', sourceInstitution: '',
      sourceDepartment: '', sourceDoctor: '', verificationStatus: 'source_verified',
      outpatientRecord: { ...original.outpatientRecord, otherRecordContent } } }, response);
  return { response, write, original, stored };
}

test('门诊病历修订保留原版本和原件关联', async () => {
  const { response, write, original, stored } = await revise();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(write.query.diseaseRecords, stored);
  const saved = write.update.$set.diseaseRecords[0].courseEntries[0];
  assert.equal(saved.outpatientRecord.otherRecordContent, '修正后的处方');
  assert.equal(saved.sourceReportId, 'original-report');
  assert.equal(saved.revisionHistory[0].outpatientRecord.otherRecordContent, '原处方');
  assert.equal(original.outpatientRecord.otherRecordContent, '原处方');
});

test('并发更新阻止覆盖', async () => {
  const { response } = await revise({ matchedCount: 0 });
  assert.equal(response.statusCode, 409);
});

test('无变更不写入修订历史', async () => {
  const { response, write } = await revise({ otherRecordContent: '原处方' });
  assert.equal(response.body.unchanged, true);
  assert.equal(write, undefined);
});
