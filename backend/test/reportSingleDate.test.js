const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReportDate, singleItemDate } = require('../src/utils/reportExtractionPolicy');

test('Chinese prescription dates normalize to a calendar-valid report date', () => {
  assert.equal(normalizeReportDate('2026年09月27日'), '2026-09-27');
  assert.equal(normalizeReportDate('2026/9/27'), '2026-09-27');
  assert.equal(normalizeReportDate('2026年02月30日'), '');
  assert.equal(singleItemDate({ reportItems: [
    { name: '匹维溴铵片', examDate: '2026年09月27日' },
    { name: '其他药品', examDate: '2026-09-27' },
  ] }), '2026-09-27');
});

test('one reviewed endoscopy date can restore the report date', () => {
  assert.equal(singleItemDate({ pageDates: new Map([['1', '2024-04-03']]), reportItems: [{ name: '肠镜', sourcePage: 1, examDate: '2024-04-03' }] }), '2024-04-03');
});

test('multiple or invalid item dates cannot become a report date', () => {
  assert.equal(singleItemDate({ reportItems: [{ name: 'A', examDate: '2024-04-03' }, { name: 'B', examDate: '2024-04-04' }] }), '');
  assert.equal(singleItemDate({ pageDates: { 1: '' }, reportItems: [{ name: '肠镜', sourcePage: 1, examDate: '2024-04-03' }] }), '');
  assert.equal(singleItemDate({ reportItems: [{ name: '肠镜', examDate: '2024-04-31' }] }), '');
});
