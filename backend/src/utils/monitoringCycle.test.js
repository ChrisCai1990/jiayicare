const test = require('node:test');
const assert = require('node:assert/strict');
const { monitoringCycleDays, nextMonitoringDate } = require('./monitoringCycle');

test('逐项监测周期只接受明确的每日、每周或1至365天', () => {
  assert.equal(monitoringCycleDays('每日1次'), 1);
  assert.equal(monitoringCycleDays('每周1次'), 7);
  assert.equal(monitoringCycleDays('每周2次'), 'twice_weekly');
  assert.equal(monitoringCycleDays('每14天1次'), 14);
  assert.equal(monitoringCycleDays('每366天1次'), null);
  assert.equal(monitoringCycleDays(''), null);
});

test('人工随访完成后按项目周期接续，每周两次落在周一和周四', () => {
  assert.equal(nextMonitoringDate('2026-11-23T02:00:00Z', '每日1次').toISOString().slice(0, 10), '2026-11-24');
  assert.equal(nextMonitoringDate('2026-11-23T02:00:00Z', '每14天1次').toISOString().slice(0, 10), '2026-12-07');
  assert.equal(nextMonitoringDate('2026-11-23T02:00:00Z', '每周2次').toISOString().slice(0, 10), '2026-11-26');
  assert.equal(nextMonitoringDate('2026-11-26T02:00:00Z', '每周2次').toISOString().slice(0, 10), '2026-11-30');
});
