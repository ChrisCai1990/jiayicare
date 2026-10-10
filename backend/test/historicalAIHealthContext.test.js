const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { reportYear, reportsThroughYear, historicalUserSnapshot } = require('../src/utils/historicalAIHealthContext');

test('historical context excludes later and undated reports and current profile state', () => {
  const reports = [
    { reportYear: 2024 }, { checkDate: '2025-08-01' },
    { reportYear: 2026 }, { date: '2026-01-01' }, { title: 'undated' },
  ];
  assert.deepEqual(reportsThroughYear(reports, 2025), reports.slice(0, 2));
  assert.equal(reportYear(reports[1]), 2025);
  const snapshot = historicalUserSnapshot({ _id: 'member', name: '甲', gender: '女', birthDate: '1980-03-02',
    chronicDiseases: ['2026年新诊断'], healthProfile: { pastHistory: '2026年记录' },
    lifestyle: { diet: '当前习惯' }, labValues: { glucose: 9 }, weight: 80 }, 2025);
  assert.equal(snapshot.age, 45);
  assert.deepEqual(snapshot.healthProfile, {});
  assert.deepEqual(snapshot.chronicDiseases, []);
  assert.equal(snapshot.weight, undefined);
});

test('historical audit gate checks only reports used by the selected year', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/reportAuditGate.js'), 'utf8');
  const reports = [
    { reportYear: 2025, audit_status: 'audited', createdAt: '2026-01-01' },
    { reportYear: 2026, audit_status: 'pending', createdAt: '2026-10-01' },
  ];
  const context = {
    module: { exports: {} },
    require: name => {
      if (name === './historicalAIHealthContext') return { reportsThroughYear };
      if (name.endsWith('/MedicalReport')) return { find: () => ({ select: () => ({ lean: async () => reports }) }) };
      if (name.endsWith('/User')) return { findById: () => ({ select: async () => ({
        assignedFamilyDoctor: 'doctor', archiveReviewSnapshotAt: '2026-02-01',
      }) }) };
      throw new Error(name);
    },
  };
  vm.runInNewContext(source, context);
  assert.equal(await context.module.exports.checkReportAuditGate('member', { throughYear: 2025 }), null);
  reports[0].audit_status = 'pending';
  assert.match(await context.module.exports.checkReportAuditGate('member', { throughYear: 2025 }), /2025年度还有 1 份/);
});

test('backfilling 2025 keeps the existing 2026 analysis as the latest user-facing result', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf('const activeAIHealthSummaryJobs = new Set();'), source.indexOf('// 单项重新生成'));
  let handler, saved;
  let datedReports = [{ reportYear: 2025 }];
  const existingSections = { medical_priority: { summary: '2026年分析' } };
  const existing = { sections: existingSections, latestYear: '2026', source: 'self_service', byYear: {
    2026: { records: [{ scope: 'doctor', sections: existingSections, generatedAt: '2026-06-01', source: 'self_service' }] },
  } };
  const user = { _id: 'member', aiHealthSummary: existing };
  const query = { populate() { return this; }, then(resolve) { return Promise.resolve(user).then(resolve); } };
  vm.runInNewContext(code, {
    router: { post(_route, _auth, callback) { handler = callback; } }, staffAuth() {},
    User: { findById: () => query, collection: { updateOne: async (_filter, update) => {
      saved = update.$set.aiHealthSummary; return { matchedCount: 1 };
    } } },
    MedicalReport: { find: () => ({ select: () => ({ lean: async () => datedReports }) }) },
    DOCTOR_KEYS: ['medical_priority'], LIFESTYLE_KEY: 'lifestyle_assessment',
    withReviewTokens: require('../src/utils/summaryReviewVersion').withReviewTokens,
    generateHealthSummarySections: async (_user, options) => {
      assert.equal(options.analysisYear, '2025');
      return { sections: { medical_priority: { summary: '2025年分析' } }, failed: false };
    },
    require: name => {
      if (name.endsWith('historicalAIHealthContext')) return { reportYear };
      if (name.endsWith('healthPriorityLinks')) return require('../src/utils/healthPriorityLinks');
      if (name.endsWith('packageFeatureEntitlements')) return { getAiEntitlements: async () => ({ aiHealthAnalysis: true }) };
      if (name.endsWith('serviceAccess')) return { resolveServiceAccess: async () => ({}) };
      if (name.endsWith('reportAuditGate')) return { checkReportAuditGate: async () => null };
      throw new Error(name);
    },
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'member' }, body: { year: '2025', scope: 'doctor' }, staff: { role: 'familyDoctor' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(saved.byYear[2025].records[0].sections.medical_priority.summary, '2025年分析');
  assert.equal(saved.latestYear, '2026');
  assert.equal(saved.sections.medical_priority.summary, '2026年分析');
  assert.equal(saved.source, 'self_service');
  datedReports = [];
  const missing = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ params: { id: 'member' }, body: { year: '2025', scope: 'doctor' }, staff: { role: 'familyDoctor' } }, missing);
  assert.equal(missing.statusCode, 400);
});
