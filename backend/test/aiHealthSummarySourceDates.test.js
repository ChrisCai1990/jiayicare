const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStructuredSourceEvidence } = require('../src/utils/aiHealthSummary');

test('card source evidence uses item examination dates and keeps only the five-year window', () => {
  const reports = [{ _id: 'report-1', checkDate: '2026-10-01', reportYear: 2026, title: '年度报告', reportItems: [
    { name: '血糖', examDate: '2021-05-01', value: '7.1', unit: 'mmol/L' },
    { name: '血糖', examDate: '2025-05-01', value: '5.4', unit: 'mmol/L', referenceRange: '3.9-6.1' },
  ] }];
  const evidence = buildStructuredSourceEvidence('血糖', reports, /血糖/, 2026);
  assert.equal(evidence.length, 1);
  assert.deepEqual(evidence[0].items.map(item => [item.date, item.value]), [['2025-05-01', '5.4']]);
  assert.equal(evidence[0].items[0].referenceRange, '3.9-6.1');
});
