const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { reviewToken, resolveReviewRecord } = require('../src/utils/summaryReviewVersion');

test('review preview uses the selected record and the same conflict rule as approval', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const code = source.slice(source.indexOf("router.get('/patients/:id/ai-health-summary/review-conflicts'"),
    source.indexOf('// PATCH /api/staff/patients/:id/ai-health-summary'));
  let handler;
  const oldRecord = { scope: 'doctor', sections: { tumor_risk: { summary: 'CA72-4近年持续高于参考上限' } } };
  const newRecord = { scope: 'doctor', sections: { tumor_risk: { summary: 'CA72-4在参考范围内' } } };
  const user = { aiHealthSummary: { byYear: { 2026: { records: [newRecord, oldRecord] } } } };
  const reports = [{ checkDate: '2026-09-23', reportItems: [{ name: 'CA72-4', value: '9.05', referenceRange: '<19.10' }] }];
  vm.runInNewContext(code, {
    router: { get(_path, _auth, callback) { handler = callback; } }, staffAuth() {},
    getVisiblePlanPatientIds: async () => ['member'],
    User: { findById: () => ({ select: () => ({ lean: async () => user }) }) },
    MedicalReport: { find: () => ({ select: () => ({ lean: async () => reports }) }) },
    resolveReviewRecord, Date,
    require: name => {
      if (name.endsWith('historicalAIHealthContext')) return { reportsThroughYear: value => value };
      if (name.endsWith('tumorMarkerFactGuard')) return require('../src/utils/tumorMarkerFactGuard');
      throw new Error(name);
    },
  });
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const req = { params: { id: 'member' }, query: { year: '2026', token: reviewToken(oldRecord) }, staff: { role: 'familyDoctor' } };
  const res = response(); await handler(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.conflicts[0].claim, oldRecord.sections.tumor_risk.summary);
  assert.equal(res.body.conflicts[0].evidence[0].referenceRange, '<19.10');
  const forbidden = response(); await handler({ ...req, staff: { role: 'nutritionist' } }, forbidden);
  assert.equal(forbidden.statusCode, 403);
  const stale = response(); await handler({ ...req, query: { year: '2026', token: '0'.repeat(64) } }, stale);
  assert.equal(stale.statusCode, 409);
});
