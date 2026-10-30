const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('only the assigned health manager can reconcile a checkup plan', async () => {
  const source = fs.readFileSync(require.resolve('../src/routes/staff.js'), 'utf8');
  const start = source.indexOf('async function canReviewAnnualCheckup(');
  const end = source.indexOf('const checkupReconcileModels', start);
  const canReview = vm.runInNewContext(`${source.slice(start, end)}; canReviewAnnualCheckup`, {
    User: { findById: () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: 'manager-1' }) }) }) },
    checkPlanTypeRole: () => false,
    planTypeAllowed: async () => true,
    canManagePlan: async () => false,
  });
  const plan = { type: 'annual_checkup', patientId: 'patient-1' };
  assert.equal(await canReview({ staff: { role: 'healthManager', _id: 'manager-1' } }, plan), true);
  assert.equal(await canReview({ staff: { role: 'healthManager', _id: 'manager-2' } }, plan), false);
  assert.equal(await canReview({ staff: { role: 'healthManager', _id: 'manager-1' } }, { ...plan, type: 'nutrition' }), false);
});

test('assigned manager can use the checkup review action without whole-plan edit permission', async () => {
  const source = fs.readFileSync(require.resolve('../src/routes/staff.js'), 'utf8');
  const start = source.indexOf('async function canReviewAnnualCheckup(');
  const end = source.indexOf('const checkupReconcileModels', start);
  const gate = vm.runInNewContext(`${source.slice(start, end)}; checkupReviewOrPlanEdit`, {
    User: { findById: () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: 'manager-1' }) }) }) },
    HealthPlan: { findById: () => ({ select: () => ({ lean: async () => ({ type: 'annual_checkup', patientId: 'patient-1' }) }) }) },
    checkPlanTypeRole: () => false,
    planTypeAllowed: async () => true,
    canManagePlan: async () => false,
    checkPermission: () => (_req, res) => res.status(403).json({ success: false }),
  });
  let passed = false;
  const response = { status: () => response, json: value => value };
  await gate({ staff: { role: 'healthManager', _id: 'manager-1' }, params: { id: 'plan' } }, response, () => { passed = true; });
  assert.equal(passed, true);
  passed = false;
  await gate({ staff: { role: 'healthManager', _id: 'manager-2' }, params: { id: 'plan' } }, response, () => { passed = true; });
  assert.equal(passed, false);
});
