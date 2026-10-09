const test = require('node:test');
const assert = require('node:assert/strict');
const { recordsWithinDays } = require('../src/utils/reportTrend');

test('weekly report excludes older measurements while monthly report retains them', () => {
  const rows = [
    { recordedAt: '2026-09-29T08:00:00+08:00', value: '50' },
    { recordedAt: '2026-10-04T08:00:00+08:00', value: '49.5' },
    { recordedAt: '2026-10-09T08:00:00+08:00', value: '48.1' },
  ];
  const now = new Date('2026-10-09T12:00:00+08:00').getTime();
  assert.deepEqual(recordsWithinDays(rows, 7, now).map(row => row.value), ['49.5', '48.1']);
  assert.deepEqual(recordsWithinDays(rows, 30, now).map(row => row.value), ['50', '49.5', '48.1']);
});
