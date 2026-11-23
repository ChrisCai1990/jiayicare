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
  const [monitoring] = buildAnnualPlanDisplayItems(customer);
  assert.equal(monitoring.category, '日常监测');
  assert.deepEqual(monitoring.monitoringItems.map(row => ({ title: row.title,
    period: row.measurementPeriod, frequency: row.frequency })), [
    { title: '血压', period: '晨起、中午、下午、睡前', frequency: '每周1次' },
  ]);
  assert.match(monitoring.customerAction, /血压：晨起、中午、下午、睡前 · 每周1次/);
});

test('下一年度体检在成品方案保留顾问核对的关注项目', () => {
  const [row] = buildAnnualPlanDisplayItems(customerModuleData({ annual_checkup: { enabled: true, date: '2027-10-08',
    institution: '体检机构', focus: '项目甲\n项目乙' } }));
  assert.equal(row.focus, '项目甲\n项目乙');
  assert.equal(row.schedule, '2027-10-08');
  assert.match(row.customerAction, /项目甲、项目乙/);
});
