const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateReport, aggregateEvaluations } = require('../src/utils/reportExtractionEvaluation');

test('reports missing rows, field errors and false additions without outputting clinical text', () => {
  const result = evaluateReport({ reportType: 'physical_exam', truth: [
    { page: 2, section: '生化', name: '项目甲', value: '6.2', unit: 'mmol/L', status: 'abnormal', rowOrder: 1 },
    { page: 2, section: '生化', name: '项目乙', value: '2.0', rowOrder: 2 },
  ], extracted: [
    { sourcePage: 2, sourceSection: '生化', name: '项目甲', value: '6.3', unit: 'mmol/L', status: 'normal', sourceRowOrder: 1 },
    { sourcePage: 3, sourceSection: '其他', name: '多余项目', value: '1' },
  ] });
  assert.equal(result.matchedRows, 1);
  assert.equal(result.missingRows, 1);
  assert.equal(result.extraRows, 1);
  assert.deepEqual(result.missingPages, [2]);
  assert.deepEqual(result.fields.value, { expected: 2, correct: 0 });
  assert.deepEqual(result.fields.unit, { expected: 1, correct: 1 });
  assert.equal(result.abnormalMatched, 0);
  assert.equal(JSON.stringify(result).includes('项目甲'), false);
});

test('keeps annual and single-exam metrics separate', () => {
  const totals = aggregateEvaluations([
    { reportType: 'physical_exam', truth: [{ name: '甲', value: '1' }], extracted: [] },
    { reportType: 'lab_report', truth: [{ name: '乙', value: '2' }], extracted: [{ name: '乙', value: '2' }] },
  ]);
  assert.equal(totals.find(row => row.reportType === 'physical_exam').missingRows, 1);
  assert.equal(totals.find(row => row.reportType === 'lab_report').matchedRows, 1);
});
