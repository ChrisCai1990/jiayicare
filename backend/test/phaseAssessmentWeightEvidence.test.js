const test = require('node:test');
const assert = require('node:assert/strict');
const { comparableWeightChange } = require('../src/utils/phaseAssessmentWeightEvidence');

test('同周期体重记录提供首末日期、数值与下降幅度', () => {
  const result = comparableWeightChange([
    { type: 'weight', value: '82.5', unit: 'kg', recordedAt: '2026-10-02T08:00:00Z' },
    { type: 'diet', value: '早餐', recordedAt: '2026-10-05T08:00:00Z' },
    { type: 'weight', value: '79.2', unit: 'kg', recordedAt: '2026-10-28T08:00:00Z' },
  ]);
  assert.equal(result.deltaKg, -3.3);
  assert.match(result.observation, /2026-10-02 82.5 kg → 2026-10-28 79.2 kg，下降3.3 kg/);
});

test('单次体重及单位不一致的记录不生成变化结论', () => {
  assert.equal(comparableWeightChange([{ type: 'weight', value: '80', unit: 'kg', recordedAt: '2026-10-02' }]), null);
  assert.equal(comparableWeightChange([
    { type: 'weight', value: '80', unit: 'kg', recordedAt: '2026-10-02' },
    { type: 'weight', value: '150', unit: '斤', recordedAt: '2026-10-28' },
  ]), null);
});

test('跨 UTC 日期的早晨体重按北京时间显示', () => {
  const result = comparableWeightChange([
    { type: 'weight', value: '111.5', unit: 'kg', recordedAt: '2026-10-20T22:05:18.515Z' },
    { type: 'weight', value: '109.4', unit: 'kg', recordedAt: '2026-10-30T22:46:06.215Z' },
  ]);
  assert.equal(result.first.date, '2026-10-21');
  assert.equal(result.last.date, '2026-10-31');
  assert.equal(result.deltaKg, -2.1);
});
