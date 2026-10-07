const test = require('node:test');
const assert = require('node:assert/strict');
const { compactReportTimeline, compactHealthSummary } = require('../src/utils/annualGenerationEvidence');

test('generation evidence keeps latest lab and comparison imaging with original source ids', () => {
  const rows = [
    { id: 'new-glucose', group: '血糖', date: '2026-09-01', name: '血糖', result: '5.6' },
    { id: 'old-glucose', group: '血糖', date: '2025-09-01', name: '血糖', result: '5.5' },
    { id: 'new-a1c', group: '糖化血红蛋白A1c', date: '2026-09-01', name: '糖化血红蛋白A1c', result: '5.6%' },
    { id: 'old-a1c', group: '糖化血红蛋白A1c', date: '2026-06-01', name: '糖化血红蛋白A1c', result: '6.0%' },
    { id: 'new-ct', group: '肺CT', date: '2026-06-01', name: '肺CT', result: '磨玻璃结节' },
    { id: 'old-ct', group: '肺CT', date: '2025-06-01', name: '肺CT', result: '较小结节' },
  ];
  const compact = compactReportTimeline(rows);
  assert.deepEqual(compact.map(row => row.id), ['new-glucose', 'new-a1c', 'old-a1c', 'new-ct', 'old-ct']);
  assert.equal(compact.find(row => row.id === 'new-a1c').result, '5.6%');
});

test('generation summary retains confirmed abnormal findings and drops unrelated bulk', () => {
  const result = compactHealthSummary({
    medical_priority: { items: [{ name: '高血压', current: '待核实', action: '复评', bulky: 'x'.repeat(10000) }] },
    chronic_disease: { items: [{ name: '血糖', status: 'normal' }, { name: '血压', status: 'abnormal', latest: '偏高' }] },
    tumor_risk: { abnormal: ['肺结节'] },
  });
  assert.deepEqual(result.chronicFindings, [{ name: '血压', latest: '偏高', status: 'abnormal' }]);
  assert.equal(result.medicalPriority[0].bulky, undefined);
  assert.deepEqual(result.tumorFindings, ['肺结节']);
});
