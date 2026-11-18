const test = require('node:test');
const assert = require('node:assert/strict');
const { findCarryovers } = require('../src/utils/annualFollowUpCarryover');

const desired = (date, ids = ['management_issue:eye']) => ({ sourceScheduleKey: `medical_treatment:${date}:眼科`, managementIssueIds: ids });
const prior = (date, status = 'planned', ids = ['management_issue:eye']) => ({ ...desired(date, ids), status });

test('same confirmed problem continues the active follow-up across dates and plans', () => {
  const next = desired('2026-12-01'), old = prior('2026-11-01');
  assert.deepEqual(findCarryovers([next], [old]), [{ desired: next, prior: old }]);
  assert.equal(findCarryovers([next], [prior('2026-11-01', 'completed')]).length, 0);
});

test('ambiguous or differently sourced items are not merged', () => {
  assert.equal(findCarryovers([desired('2026-12-01'), desired('2026-12-02')], [prior('2026-11-01')]).length, 0);
  assert.equal(findCarryovers([desired('2026-12-01')], [prior('2026-11-01'), prior('2026-11-02')]).length, 0);
  assert.equal(findCarryovers([desired('2026-12-01')], [prior('2026-11-01', 'planned', ['management_issue:other'])]).length, 0);
  assert.equal(findCarryovers([desired('2026-12-01', [])], [prior('2026-11-01')]).length, 0);
});
