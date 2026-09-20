const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { completeAuditedPlanItem } = require('../src/utils/auditedPlanItem');
test('unaudited or incomplete references never write', async () => {
  const model = { updateOne: () => assert.fail('unexpected write') };
  const report = { _id: 'r', user: 'u', planId: 'p', planItemId: 'i', audit_status: 'audited' };
  for (const field of Object.keys(report)) assert.equal(await completeAuditedPlanItem(model, { ...report, [field]: null }), false);
});
test('atomic filter keeps same patient, pending item and matching report', async () => {
  const model = { updateOne: async (filter, update) => {
    assert.equal(filter.patientId, 'u');
    assert.equal(filter['reportItemWriteFences.r'], 1);
    assert.equal(filter.items.$elemMatch.status, 'pending');
    assert.deepEqual(filter.items.$elemMatch.$or, [{ reportId: null }, { reportId: 'r' }]);
    assert.equal(update.$set['items.$.reportId'], 'r');
    return { modifiedCount: 0 };
  } };
  assert.equal(await completeAuditedPlanItem(model, { _id: 'r', user: 'u', planId: 'p', planItemId: 'i', audit_status: 'audited', planItemWriteEpoch: 1 }), false);
});
test('audit route persists report before completing its item', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const route = source.split("router.patch('/medical-reports/:id/audit'")[1].split("// GET /api/staff/patients/:id/reports/pending-doctor-audit")[0];
  assert.ok(route.indexOf('await report.save()') < route.indexOf('.safeReconcile'));
  assert.doesNotMatch(route, /await plan.save\(\)/);
});
test('AI review entry uses the same completion helper only after saved audited review', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const route = source.split("router.patch('/medical-reports/:id',")[1].split("router.post('/medical-reports/:id/health-course-draft'")[0];
  assert.ok(route.indexOf('await report.save()') >= 0);
  assert.ok(route.indexOf('await report.save()') < route.indexOf('.safeReconcile'));
  assert.match(route, /catch \(err\) \{\s*if \(err.name === 'DocumentNotFoundError'\) return .*sendReportWriteConflict\(res\);\s*throw err;/);
  assert.match(route, /if \(aiStatus === 'reviewed' && report.audit_status === 'audited'\) \{\s*await require\('\.\.\/utils\/reportPlanItemQueue'\).runtime\(\).safeReconcile/);
});
