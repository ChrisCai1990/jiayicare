const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, metricEvidence } = require('../src/utils/managementGoalMetrics');

const period = { start:'2026-10-01', end:'2026-10-31' };
test('vital goal compares the matching numeric value and retains record sources', () => {
  const metric = { source:'vital', key:'systolic', unit:'mmHg', operator:'lte', targetValue:'125' };
  const records = [
    { _id:'before', type:'bloodPressure', recordedAt:new Date('2026-09-30T15:00:00Z'), extra:{sys:150,dia:90}, unit:'mmHg' },
    { _id:'first', type:'bloodPressure', recordedAt:new Date('2026-10-02T02:00:00Z'), extra:{sys:140,dia:85}, unit:'mmHg' },
    { _id:'last', type:'bloodPressure', recordedAt:new Date('2026-10-28T02:00:00Z'), extra:{sys:130,dia:80}, unit:'mmHg' },
    { _id:'wrong-unit', type:'bloodPressure', recordedAt:new Date('2026-10-29T02:00:00Z'), extra:{sys:120}, unit:'kPa' },
  ];
  const result = metricEvidence(metric, records, [], period);
  assert.equal(result.count, 2);
  assert.equal(result.first.sourceId, 'first');
  assert.equal(result.latest.value, 130);
  assert.equal(result.change, -10);
  assert.equal(result.target.difference, 5);
});

test('audited report item requires exact name and unit; ambiguous values are excluded', () => {
  const metric = { source:'report_item', name:'糖化血红蛋白', unit:'%', operator:'lte', targetValue:'7' };
  const reports = [{ _id:'r1', checkDate:'2026-10-20', reportItems:[
    { itemId:'a', name:'糖化血红蛋白', value:'7.2', unit:'%' },
    { itemId:'b', name:'糖化血红蛋白', value:'7.2 mmol/L', unit:'%' },
    { itemId:'c', name:'糖化血红蛋白', value:'7.2', unit:'mmol/L' },
  ] }];
  const result = metricEvidence(metric, [], reports, period);
  assert.equal(result.count, 1);
  assert.equal(result.latest.itemId, 'a');
  assert.equal(result.target.difference, 0.2);
  assert.equal(validate({ source:'report_item', name:'', unit:'%' }), false);
});

test('different same-day report values require human reconciliation', () => {
  const metric = { source:'report_item', name:'糖化血红蛋白', unit:'%' };
  const reports = [
    { _id:'r1', checkDate:'2026-10-20', reportItems:[{ name:'糖化血红蛋白', value:'7.2', unit:'%' }] },
    { _id:'r2', checkDate:'2026-10-20', reportItems:[{ name:'糖化血红蛋白', value:'7.4', unit:'%' }] },
  ];
  const result = metricEvidence(metric, [], reports, period);
  assert.equal(result.ambiguous, true);
  assert.equal(result.latest, null);
});
