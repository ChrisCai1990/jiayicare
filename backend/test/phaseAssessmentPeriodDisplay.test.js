const test = require('node:test');
const assert = require('node:assert/strict');
const { prematureCalendarQuarter } = require('../src/utils/phaseAssessmentPeriodDisplay');

test('clarifies a historical calendar-quarter assessment generated before quarter end', () => {
  const display = prematureCalendarQuarter({
    periodKey: '2026-Q4',
    createdAt: '2026-11-02T01:30:30.674Z',
    templateSnapshot: { frequency: 'quarterly' },
  });
  assert.match(display.displayLabel, /自然年第4季度/);
  assert.match(display.displayLabel, /非服务第4季度/);
  assert.match(display.notice, /季度结束前生成/);
});

test('does not relabel completed quarters or monthly assessments', () => {
  assert.equal(prematureCalendarQuarter({ periodKey: '2026-Q3', createdAt: '2026-10-01T00:00:00Z', templateSnapshot: { frequency: 'quarterly' } }), null);
  assert.equal(prematureCalendarQuarter({ periodKey: '2026-10', createdAt: '2026-11-01T00:00:00Z', templateSnapshot: { frequency: 'monthly' } }), null);
});
