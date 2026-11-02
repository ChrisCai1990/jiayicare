const test = require('node:test');
const assert = require('node:assert/strict');
const { prematureCalendarQuarter } = require('../src/utils/phaseAssessmentPeriodDisplay');

test('clarifies a historical calendar-quarter assessment generated before quarter end', () => {
  const display = prematureCalendarQuarter({
    periodKey: '2026-Q4',
    status: 'finalized',
    createdAt: '2026-11-02T01:30:30.674Z',
    templateSnapshot: { frequency: 'quarterly' },
  });
  assert.match(display.displayLabel, /2026年自然历第4季度/);
  assert.equal(display.periodClassification, 'premature_legacy_quarter');
  assert.match(display.notice, /不能作为完整季度结论/);
});

test('does not relabel completed quarters or monthly assessments', () => {
  assert.equal(prematureCalendarQuarter({ periodKey: '2026-Q3', status: 'finalized', createdAt: '2026-10-01T00:00:00Z', templateSnapshot: { frequency: 'quarterly' } }), null);
  assert.equal(prematureCalendarQuarter({ periodKey: '2026-10', status: 'finalized', createdAt: '2026-11-01T00:00:00Z', templateSnapshot: { frequency: 'monthly' } }), null);
  assert.equal(prematureCalendarQuarter({ periodKey: '2026-Q4', status: 'team_review', createdAt: '2026-11-02T01:30:30Z', templateSnapshot: { frequency: 'quarterly' } }), null);
});
