const test = require('node:test');
const assert = require('node:assert/strict');
const { mergePrescriptionReview, needsScaleReferenceReview, mergeScaleReferenceReview } = require('../src/utils/reportFocusedReview');
const { REPORT_PARSE_PROMPT, PRESCRIPTION_PARSE_PROMPT } = require('../src/utils/reportExtractionPolicy');

test('prescription review fills missing instructions without replacing existing or mixing repeated slips', () => {
  const items = [
    { itemType: 'medication', name: '帕诺思', examDate: '2026-08-19', referenceRange: '', findings: '' },
    { itemType: 'medication', name: '帕诺思', examDate: '2026-10-13', referenceRange: '每日一次，每次3粒', findings: '' },
  ];
  const reviewed = [
    { name: '帕诺思', examDate: '2026-08-19', referenceRange: '每日一次，每次3粒', findings: '口服' },
    { name: '帕诺思', examDate: '2026-10-13', referenceRange: '错误候选', findings: '口服' },
  ];
  const result = mergePrescriptionReview(items, reviewed);
  assert.equal(result[0].referenceRange, '每日一次，每次3粒');
  assert.equal(result[0].findings, '口服');
  assert.equal(result[1].referenceRange, '每日一次，每次3粒');
  assert.equal(result[1].findings, '口服');
  assert.equal(mergePrescriptionReview([{ itemType: 'medication', name: '帕诺思', referenceRange: '' }], reviewed)[0].referenceRange, '');
  assert.equal(mergePrescriptionReview([{ itemType: 'medication', name: '1）[帕诺思]文拉法辛缓释胶囊', referenceRange: '' }],
    [{ name: '文拉法辛缓释胶囊', referenceRange: '每日一次，每次3粒' }])[0].referenceRange, '每日一次，每次3粒');
});

test('scale review replaces a total-score interval only with a separately extracted normal threshold', () => {
  const item = { name: '7项广泛性焦虑障碍量表(GAD-7)', value: '7', referenceRange: '0～21', status: 'abnormal' };
  assert.equal(needsScaleReferenceReview([item]), true);
  const corrected = mergeScaleReferenceReview([item], [{ name: item.name, value: '7', referenceRange: '≤4' }]);
  assert.equal(corrected[0].referenceRange, '≤4');
  assert.equal(corrected[0].status, 'abnormal');
  const uncertain = mergeScaleReferenceReview([item], [{ name: item.name, value: '7', referenceRange: '0～21' }]);
  assert.equal(uncertain[0].referenceRange, '');
  assert.match(uncertain[0].reviewIssues[0], /待核对/);
  assert.equal(mergeScaleReferenceReview([item], [{ name: item.name, value: '8', referenceRange: '≤4' }])[0].referenceRange, '');
});

test('vision prompts distinguish prescription directions and scale normal thresholds', () => {
  assert.match(PRESCRIPTION_PARSE_PROMPT, /每次3粒/);
  assert.match(REPORT_PARSE_PROMPT, /总分范围.*正常参考值/);
});
