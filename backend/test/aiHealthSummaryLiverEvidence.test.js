const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/utils/aiHealthSummary.js'), 'utf8');
const context = {};
vm.runInNewContext([
  source.slice(source.indexOf('const COMMON_CANCER_CATALOG'), source.indexOf('const FOCUSED_TREND_RULES')),
  source.slice(source.indexOf('function buildStructuredSourceEvidence'), source.indexOf('// 遍历 medical_priority.items')),
  'globalThis.readEvidence = (user, reports, year) => ({ grouped: buildCancerEvidenceText(user, reports, year), structured: buildStructuredSourceEvidence("肝癌", reports, CANCER_EVIDENCE_RULES.肝癌, year) });',
].join('\n'), context);

test('liver cancer evidence includes hepatitis results filed under infectious disease screening', () => {
  const reports = [{
    _id: 'infectious-report', checkDate: '2026-08-12', reportYear: 2026,
    title: '传染病筛查', screeningCategory: 'other',
    reportItems: [
      { name: '乙肝表面抗原 HBsAg', value: '阳性', itemType: 'lab' },
      { name: '传染病四项', value: 'HCV-RNA 未检出', itemType: 'lab' },
      { name: '梅毒螺旋体抗体', value: '阴性', itemType: 'lab' },
    ],
  }];

  const { grouped, structured } = context.readEvidence({ gender: '男' }, reports, 2026);
  const liver = grouped.match(/【肝癌】([\s\S]*?)(?=【胃癌】)/)?.[1];
  assert.ok(liver);
  assert.match(liver, /RPT-001.*2026-08-12/);
  assert.match(liver, /乙肝表面抗原 HBsAg=阳性/);
  assert.match(liver, /传染病四项=HCV-RNA 未检出/);
  assert.doesNotMatch(liver, /梅毒螺旋体抗体/);
  assert.equal(structured.length, 1);
  assert.equal(structured[0].reportId, 'infectious-report');
  assert.equal(structured[0].items.length, 2);
});
