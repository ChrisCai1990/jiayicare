const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('annual concern accepts the latest separately approved section without approving the whole five dimensions', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');
  const start = source.indexOf('const CONCERN_SECTIONS =');
  const end = source.indexOf('async function caseReviewPatientOr404', start);
  const context = { mongoose: {}, MedicalReport: {} };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.concernSourceForTest = concernSource;`, context);
  const record = { scope: 'doctor', doctorApprovedAt: null,
    sectionReviews: { cardiovascular_risk: { status: 'approved', approvedAt: '2026-10-14' }, tumor_risk: { status: 'draft' } },
    sections: { cardiovascular_risk: { topics: [{ name: '心脏超声', latest: '2026-09-23 左房内径 35mm' }] },
      tumor_risk: { cancers: [{ name: '胃癌', latest: 'CA72-4持续升高' }] } },
  };
  const user = { aiHealthSummary: { byYear: { 2026: { records: [record] } } } };
  const approved = await context.concernSourceForTest(user, { kind: 'ai_health', year: 2026, sectionKey: 'cardiovascular_risk', itemName: '心脏超声' });
  assert.equal(approved.kind, 'ai_health_trend');
  assert.equal(approved.source.approvedAt, '2026-10-14');
  await assert.rejects(context.concernSourceForTest(user, { kind: 'ai_health', year: 2026, sectionKey: 'tumor_risk', itemName: '胃癌' }), /请先审核该板块/);
});

test('unreviewed AI card can locate an audited report without treating AI text as reviewed evidence', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');
  const start = source.indexOf('const CONCERN_SECTIONS =');
  const end = source.indexOf('async function caseReviewPatientOr404', start);
  const reportId = '507f1f77bcf86cd799439011';
  let reportFilter;
  const context = {
    mongoose: { isValidObjectId: id => id === reportId },
    MedicalReport: { find: filter => { reportFilter = filter; return { lean: async () => [{ _id: reportId, checkDate: '2026-09-23',
      reportItems: [{ name: '肝脏超声', conclusion: '右肝偏高回声结节，边界清晰' }] }] }; } },
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.concernSourceForTest = concernSource;`, context);
  const record = { scope: 'doctor', sectionReviews: { tumor_risk: { status: 'draft' } },
    sections: { tumor_risk: { cancers: [{ name: '肝癌', latest: '未经审核的AI文字',
      sourceEvidence: [{ reportId, items: [{ itemIndex: 0 }] }] }] } } };
  const user = { _id: 'patient', aiHealthSummary: { byYear: { 2026: { records: [record] } } } };
  const result = await context.concernSourceForTest(user, { kind: 'ai_health', year: 2026, sectionKey: 'tumor_risk', itemName: '肝癌' });
  assert.equal(result.kind, 'screening');
  assert.equal(reportFilter.audit_status, 'audited');
  assert.equal(reportFilter.user, 'patient');
  assert.match(result.evidence, /右肝偏高回声结节/);
  assert.doesNotMatch(result.evidence, /未经审核的AI文字/);
  assert.equal(result.source.evidenceType, 'audited_reports');
});
