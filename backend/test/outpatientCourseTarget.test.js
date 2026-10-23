const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const start = source.indexOf('const CLINICAL_MANAGER_DOCUMENTS');
const end = source.indexOf('const parseAiJson', start);
const dossier = { _id: 'dossier-1', name: '高血压', summary: { initialDiagnosis: '已核对原始诊断' } };
let records = [];
const context = {
  User: { findById: () => ({ select: () => ({ lean: async () => ({ diseaseRecords: records }) }) }) },
  MEDICAL_SUMMARY_FIELDS: ['initialDiagnosis'],
};
vm.runInNewContext(source.slice(start, end) + '\nthis.guard = { clinicalManagerAuditError, outpatientCourseTargetError };', context);

test('门诊病历审核必须先指定有首次概况的专病首页，处方原件由健管专员审核', async () => {
  const outpatient = { documentCategory: 'outpatient_record', user: 'patient-1' };
  assert.match(await context.guard.outpatientCourseTargetError(outpatient), /建立专病首页/);
  records = [];
  assert.match(await context.guard.outpatientCourseTargetError({ ...outpatient, courseTargetDiseaseId: dossier._id }), /不存在/);
  records = [{ ...dossier, summary: {} }];
  assert.match(await context.guard.outpatientCourseTargetError({ ...outpatient, courseTargetDiseaseId: dossier._id }), /首次概况/);
  records = [dossier];
  assert.equal(await context.guard.outpatientCourseTargetError({ ...outpatient, courseTargetDiseaseId: dossier._id }), '');
  assert.match(context.guard.clinicalManagerAuditError({ documentCategory: 'prescription_order' }, { role: 'familyDoctor' }), /健管专员/);
  assert.equal(context.guard.clinicalManagerAuditError({ documentCategory: 'prescription_order' }, { role: 'healthManager' }), '');
});
