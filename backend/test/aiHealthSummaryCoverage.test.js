const test = require('node:test');
const assert = require('node:assert/strict');

const { reconcileGynecologicUltrasoundCoverage } = require('../src/utils/aiHealthSummary');

test('子宫附件超声规则证据纠正AI生成的缺失结论和补做建议', () => {
  const sections = {
    tumor_risk: {
      completed: ['卵巢癌（附件超声）'],
      missing: ['子宫内膜癌（经阴道妇科超声）'],
      overview: { coveredCount: 0, attentionCount: 0, unknownCount: 1 },
      cancers: [{ name: '子宫体癌', status: 'unknown', latest: '暂无有效记录', trendStatus: 'no_data' }],
    },
    checkup_completeness: {
      covered: ['卵巢癌（附件超声）'],
      missing: ['子宫内膜癌（经阴道妇科超声）'],
      suggestion: '下年度重点补做肠镜、胃镜（含食管）、乳腺钼靶及经阴道妇科超声；延续随访。',
    },
  };
  const coverage = [{ key: 'endometrial', status: 'ok', doneItems: ['子宫附件/经阴道超声(2026-06-18)'] }];

  reconcileGynecologicUltrasoundCoverage(sections, coverage);

  assert.deepEqual(sections.tumor_risk.missing, []);
  assert.match(sections.tumor_risk.completed.at(-1), /子宫体癌/);
  assert.equal(sections.tumor_risk.cancers[0].status, 'covered');
  assert.deepEqual(sections.checkup_completeness.missing, []);
  assert.match(sections.checkup_completeness.covered.at(-1), /子宫附件/);
  assert.doesNotMatch(sections.checkup_completeness.suggestion, /经阴道/);
});
