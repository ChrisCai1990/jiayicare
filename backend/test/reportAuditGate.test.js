const test = require('node:test');
const assert = require('node:assert/strict');

const MedicalReport = require('../src/models/MedicalReport');
const { checkScreeningYearSummaryGate, pendingDoctorAuditFilter } = require('../src/utils/reportAuditGate');

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
  assert.deepEqual(calls[0].archiveOnly, { $ne: true });
  assert.deepEqual(calls[1].archiveOnly, { $ne: true });
});

test('resubmitted report is visible to advisor again after the previous archive confirmation', () => {
  const date = new Date('2026-10-14T08:00:00Z');
  const filter = pendingDoctorAuditFilter('patient-id', date);
  assert.deepEqual(filter.archiveOnly, { $ne: true });
  assert.deepEqual(filter.$or, [
    { createdAt: { $gt: date } },
    { 'advisorCorrection.resubmittedAt': { $gt: date } },
  ]);
});

test('screening yearly summary is allowed after all same-year reports are audited', async t => {
  const original = MedicalReport.countDocuments;
  t.after(() => { MedicalReport.countDocuments = original; });
  MedicalReport.countDocuments = async filter => filter.audit_status ? 0 : 5;

  assert.equal(await checkScreeningYearSummaryGate('patient-id', 2026), null);
});
