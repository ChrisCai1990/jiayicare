const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/aiHealthSummary.js'), 'utf8');
const context = {};
vm.runInNewContext(source.slice(source.indexOf('function reportsInAnalysisWindow'), source.indexOf('const COMMON_CANCER_CATALOG')), context);
const reportsInAnalysisWindow = (reports, year) => Array.from(context.reportsInAnalysisWindow(reports, year));

test('2026 five-dimensional analysis excludes 2020 reports from every report-derived input', () => {
  const reports = [
    { _id: 'old', checkDate: '2020-12-31', reportYear: 2020 },
    { _id: 'outside', checkDate: '2021-12-31', reportYear: 2021 },
    { _id: 'first', checkDate: '2022-01-01', reportYear: 2022 },
    { _id: 'last', checkDate: '2026-12-31', reportYear: 2026 },
    { _id: 'future', checkDate: '2027-01-01', reportYear: 2027 },
    { _id: 'undated' },
    { _id: 'wrong-year', checkDate: '2020-06-01', reportYear: 2026 },
  ];
  assert.deepEqual(reportsInAnalysisWindow(reports, 2026).map(report => report._id), ['first', 'last']);
  assert.deepEqual(reportsInAnalysisWindow(reports, 2025).map(report => report._id), ['outside', 'first']);
});
