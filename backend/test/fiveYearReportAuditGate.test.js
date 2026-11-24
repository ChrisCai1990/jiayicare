const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { reportsInAnalysisWindow } = require('../src/utils/analysisReportWindow');

test('five-dimensional gate ignores unreviewed 2020 report but checks 2022–2026', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/reportAuditGate.js'), 'utf8');
  const reports = [
    { checkDate: '2020-08-01', reportYear: 2020, audit_status: 'pending', createdAt: '2026-11-01' },
    { checkDate: '2022-01-01', reportYear: 2022, audit_status: 'audited', createdAt: '2026-01-01', familyDoctorViewedAt: '2026-02-01' },
    { checkDate: '2026-09-01', reportYear: 2026, audit_status: 'audited', createdAt: '2026-09-01', familyDoctorViewedAt: '2026-10-01' },
  ];
  const context = { module: { exports: {} }, require: name => {
    if (name === './analysisReportWindow') return { reportsInAnalysisWindow };
    if (name.endsWith('/MedicalReport')) return { find: () => ({ select: () => ({ lean: async () => reports }) }) };
    if (name.endsWith('/User')) return { findById: () => ({ select: async () => ({
      assignedFamilyDoctor: 'doctor', archiveReviewSnapshotAt: '2026-10-01',
    }) }) };
    throw new Error(name);
  } };
  vm.runInNewContext(source, context);
  const gate = context.module.exports.checkReportAuditGate;
  assert.equal(await gate('member', { analysisYear: 2026 }), null);
  reports[1].audit_status = 'pending';
  assert.match(await gate('member', { analysisYear: 2026 }), /2022—2026年还有 1 份/);
});
