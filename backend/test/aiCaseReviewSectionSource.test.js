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
