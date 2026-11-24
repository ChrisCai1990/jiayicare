const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const start = source.indexOf('const SKIPPED_REPORT_PAGE_TYPES');
const end = source.indexOf('const PAGE_COVERAGE_AUDIT_PROMPT', start);
const shouldSkip = vm.runInNewContext(`${source.slice(start, end)};shouldSkipParsedReportPage`, {
  str: value => String(value || ''),
});

test('summary and education pages are skipped even when the model repeats measured rows', () => {
  const measured = [{ name: '重复的检验项目', value: '8.0', itemType: 'lab' }];
  assert.equal(shouldSkip({ pageType: 'summary', pageTitle: '总检结论', items: measured }), true);
  assert.equal(shouldSkip({ pageType: 'results', pageTitle: '体检结果汇总', items: measured }), true);
  assert.equal(shouldSkip({ pageType: 'results', pageTitle: '科普说明', items: measured }), true);
  assert.equal(shouldSkip({ pageType: 'results', pageTitle: '血常规检验报告', items: measured }), false);
  assert.match(source, /if \(!isPrescriptionReport && shouldSkipParsedReportPage\(p\) && report\.type !== 'body_comp'/);
});
