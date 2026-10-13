const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('member API hides a conflicting CA72-4 draft until source re-evaluation', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/user.js'), 'utf8');
  const code = source.slice(source.indexOf("router.get('/ai-health-summary'"), source.indexOf('// POST /api/user/ai-health-summary'));
  let handler;
  const summary = { latestYear: '2026', doctorApprovedAt: null,
    sections: { tumor_risk: { summary: 'CA72-4持续轻度升高' } } };
  vm.runInNewContext(code, {
    router: { get(_path, _auth, callback) { handler = callback; } }, auth() {},
    User: { findById: () => ({ select: async () => ({ _id: 'member', assignedFamilyDoctor: 'doctor', aiHealthSummary: summary }) }) },
    MedicalReport: { find: () => ({ select: () => ({ lean: async () => [{ checkDate: '2026-09-23',
      reportItems: [{ name: 'CA72-4', value: '9.05', referenceRange: '<19.10', status: 'normal' }] }] }) }) },
    require: name => {
      if (name.endsWith('tumorMarkerFactGuard')) return require('../src/utils/tumorMarkerFactGuard');
      if (name.endsWith('historicalAIHealthContext')) return require('../src/utils/historicalAIHealthContext');
      throw new Error(name);
    },
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ user: { _id: 'member' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(Object.keys(res.body.data.sections).length, 0);
  assert.equal(res.body.pendingReview, true);
  assert.match(res.body.message, /重新评估/);
  assert.equal(summary.sections.tumor_risk.summary, 'CA72-4持续轻度升高', 'read guard must not alter the audit record');
});
