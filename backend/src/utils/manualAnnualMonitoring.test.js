const test = require('node:test');
const assert = require('node:assert/strict');
const { manualMonitoringItems } = require('./manualAnnualMonitoring');

test('不用客户端时逐项读取年度方案周期，不擅自设默认频率', () => {
  const moduleData = { monitoring: { records: [
    { metricType: 'bloodPressure', items: '血压', measurementPeriod: '晨起、睡前', frequency: '每周1次' },
    { metricType: 'bloodSugar', items: '血糖', measurementPeriod: '空腹', frequency: '每日1次' },
  ] } };
  assert.deepEqual(manualMonitoringItems(moduleData), [
    { type: 'bloodPressure', label: '血压', period: '晨起、睡前', frequency: '每周1次' },
    { type: 'bloodSugar', label: '血糖', period: '空腹', frequency: '每日1次' },
  ]);
  assert.throws(() => manualMonitoringItems({ monitoring: { records: [{ items: '体重' }] } }), /确认周期/);
  assert.throws(() => manualMonitoringItems({ monitoring: { records: [
    { items: '体重', frequency: '每周1次' }, { items: '体重', frequency: '每日1次' },
  ] } }), /重复项目/);
});
