const test = require('node:test');
const assert = require('node:assert/strict');
const { makeCheckupScheduleRevision } = require('../src/utils/checkupScheduleRevision');

const plan = { year: 2026, checkupDate: null };
const staff = { _id: 'staff-1', name: '健康顾问' };
const at = new Date('2026-10-29T08:00:00Z');

test('changing an unpushed plan from 2026 to 2027 records both original and corrected schedule', () => {
  const revision = makeCheckupScheduleRevision(plan, 2027, '2027-06-01', staff, at);
  assert.deepEqual(revision, {
    at, by: 'staff-1', byName: '健康顾问',
    fromYear: 2026, toYear: 2027,
    fromCheckupDate: null, toCheckupDate: '2027-06-01',
  });
  assert.deepEqual(plan, { year: 2026, checkupDate: null });
});

test('saving unrelated edits does not create a schedule revision', () => {
  assert.equal(makeCheckupScheduleRevision(plan, 2026, null, staff, at), null);
  assert.equal(makeCheckupScheduleRevision({ ...plan, checkupDate: new Date('2026-06-01') }, 2026, '2026-06-01', staff, at), null);
});
