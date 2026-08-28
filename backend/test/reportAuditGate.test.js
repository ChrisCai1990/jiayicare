const test = require('node:test');
const assert = require('node:assert/strict');

const MedicalReport = require('../src/models/MedicalReport');
const { checkScreeningYearSummaryGate } = require('../src/utils/reportAuditGate');

test('screening yearly summary is blocked while same-year reports remain unaudited', async t => {
  const original = MedicalReport.countDocuments;
  t.after(() => { MedicalReport.countDocuments = original; });
  const calls = [];
  MedicalReport.countDocuments = async filter => {
    calls.push(filter);
    return filter.audit_status ? 2 : 5;
  };

  const message = await checkScreeningYearSummaryGate('patient-id', 2026);
  assert.equal(message, '2026年度还有 2 份体检报告未完成健管审核，请全部审核后再进行专项筛查小结');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].audit_status, { $ne: 'audited' });
});

test('screening yearly summary is allowed after all same-year reports are audited', async t => {
  const original = MedicalReport.countDocuments;
  t.after(() => { MedicalReport.countDocuments = original; });
  MedicalReport.countDocuments = async filter => filter.audit_status ? 0 : 5;

  assert.equal(await checkScreeningYearSummaryGate('patient-id', 2026), null);
});
