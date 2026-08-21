const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReportScreeningSubmission } = require('../src/utils/reportScreeningSubmission');

const categories = [
  { _id: 'root', name: '常规筛查', parent: null },
  { _id: 'parent', name: '妇科', parent: 'root' },
  { _id: 'leaf', name: '宫颈', parent: 'parent' },
  { _id: 'functional', name: '功能医学检测', parent: null },
  { _id: 'functional-leaf', name: '有机酸', parent: 'functional' },
];

test('submission requires one active Admin classification per report item', () => {
  const result = validateReportScreeningSubmission([
    { name: '宫颈', matchStatus: 'matched', screeningKey: 'root|妇科|宫颈', screeningKeys: ['root|妇科|宫颈'] },
    { name: '阴道', matchStatus: 'unclassified' },
    { name: '附件', matchStatus: 'matched', screeningKeys: ['root|妇科|宫颈', 'root|妇科|附件'] },
    { name: '旧节点', matchStatus: 'matched', screeningKey: 'root|妇科|已停用' },
  ], categories);
  assert.equal(result.complete, false);
  assert.deepEqual(result.issues.map(issue => issue.reason), ['unclassified', 'multiple_candidates', 'invalid_classification']);
  assert.deepEqual(result.issues.map(issue => issue.index), [1, 2, 3]);
});

test('active functional-medicine leaves are valid classifications', () => {
  const result = validateReportScreeningSubmission([
    { name: '有机酸', matchStatus: 'matched', screeningKey: 'functional|功能医学检测|有机酸', screeningKeys: ['functional|功能医学检测|有机酸'] },
  ], categories);
  assert.equal(result.complete, true);
});
