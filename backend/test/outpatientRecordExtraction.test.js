const test = require('node:test');
const assert = require('node:assert/strict');
const { OUTPATIENT_RECORD_PARSE_PROMPT, normalizeOutpatientPage, mergeOutpatientPages } = require('../src/utils/outpatientRecordExtraction');

test('outpatient extraction produces clinical review draft requiring source review', () => {
  const first = normalizeOutpatientPage({ visitDate: '2026-09-23', chiefComplaint: '原文主诉', diagnoses: ['原文诊断'], reviewIssues: [] });
  const second = normalizeOutpatientPage({ treatmentPlan: '原文处理方案', diagnoses: ['原文诊断'], reviewIssues: ['用药文字不清'] });
  const { draft, reviewIssues } = mergeOutpatientPages([first, second]);
  assert.equal(draft.chiefComplaint, '原文主诉');
  assert.equal(draft.treatmentPlan, '原文处理方案');
  assert.deepEqual(draft.diagnoses, ['原文诊断']);
  assert.equal(draft.sourceReviewed, false);
  assert.equal(draft.reviewConclusion, '');
  assert.deepEqual(reviewIssues, ['用药文字不清']);
  assert.match(OUTPATIENT_RECORD_PARSE_PROMPT, /不得把病历拆成体检/);
});

test('empty or malformed outpatient output cannot replace an existing report', () => {
  assert.throws(() => mergeOutpatientPages([normalizeOutpatientPage({ items: [{ name: '血常规', value: '正常' }] })]), /未提取到可核对的文字/);
  assert.throws(() => normalizeOutpatientPage(null), /未返回有效结构/);
});
