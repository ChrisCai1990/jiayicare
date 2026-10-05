const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReportDate, reviewMetadataError, singleItemDate } = require('../src/utils/reportExtractionPolicy');

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
  assert.equal(singleItemDate({ reportItems: [{ name: 'A', examDate: '2024-04-03' }, { name: 'B' }] }), '');
  assert.equal(singleItemDate({ pageDates: { 1: '' }, reportItems: [{ name: '肠镜', sourcePage: 1, examDate: '2024-04-03' }] }), '');
  assert.equal(singleItemDate({ reportItems: [{ name: '肠镜', examDate: '2024-04-31' }] }), '');
});

test('review accepts a confirmed page date for every result on that page', () => {
  const report = {
    institution: '体检中心',
    pageDates: new Map([['40', '2026-09-23']]),
    reportItems: [
      { name: '肝脏超声', sourcePage: 40, examDate: '2026-09-23' },
      { name: '胆囊超声', sourcePage: 40, examDate: '' },
    ],
  };
  assert.equal(reviewMetadataError(report), '');
  assert.equal(singleItemDate(report), '2026-09-23');
});

test('review still requires a date on each page of a combined report', () => {
  const report = {
    institution: '体检中心',
    pageDates: { 40: '2026-09-23' },
    reportItems: [
      { name: '肝脏超声', sourcePage: 40 },
      { name: '其他检查', sourcePage: 41 },
    ],
  };
  assert.match(reviewMetadataError(report), /逐页填写有效检查日期/);
  assert.equal(singleItemDate(report), '');
  report.pageDates[41] = '2026-09-24';
  assert.equal(reviewMetadataError(report), '');
  assert.equal(singleItemDate(report), '');
  report.pageDates[41] = '';
  report.reportItems[1].examDate = '2026-09-24';
  assert.match(reviewMetadataError(report), /逐页填写有效检查日期/);
});
