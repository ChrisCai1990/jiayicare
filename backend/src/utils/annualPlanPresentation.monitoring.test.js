const test = require('node:test');
const assert = require('node:assert/strict');
const { customerModuleData, buildAnnualPlanDisplayItems } = require('./annualPlanPresentation');

test('客户成品方案展示监测项目、时段和周期，隐藏使用方式与内部首次随访日期', () => {
  const moduleData = { monitoring: { enabled: true, clientAppUsage: 'no', firstManualFollowUpDate: '2026-11-27',
    records: [{ items: '血压', metricType: 'bloodPressure', screeningDraft: true, sourceIds: ['internal'],
      measurementPeriod: '晨起、中午、下午、睡前', frequency: '每周1次' }] } };
  const customer = customerModuleData(moduleData);
  assert.equal(customer.monitoring.clientAppUsage, undefined);
  assert.equal(customer.monitoring.firstManualFollowUpDate, undefined);
  assert.equal(customer.monitoring.records[0].screeningDraft, undefined);
  assert.deepEqual(buildAnnualPlanDisplayItems(customer).map(row => ({ title: row.title,
    period: row.measurementPeriod, frequency: row.frequency })), [
    { title: '血压', period: '晨起、中午、下午、睡前', frequency: '每周1次' },
  ]);
});
