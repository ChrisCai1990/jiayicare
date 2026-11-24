const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (['../models/Reminder', '../models/User', '../models/AnnualPlan'].includes(request)) return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { buildMonitoringReminderSpecs } = require('./annualPlanMonitoringReminders');
Module._load = originalLoad;

test('未调整血压体重周期时保留原每周客户端提醒', () => {
  const specs = buildMonitoringReminderSpecs({ createdAt: new Date(), height: 170, weight: 60 }, {
    monitoring: { records: [{ metricType: 'bloodSugar', items: '血糖', frequency: '每日1次', measurementPeriod: '空腹' }] },
  });
  const bp = specs.find(row => row.sourceKey === 'blood_pressure');
  const weight = specs.find(row => row.sourceKey === 'weight');
  assert.equal(bp.rollingWeekly, true);
  assert.equal(weight.rollingWeekly, true);
  assert.equal(specs.find(row => row.sourceKey === 'bloodSugar').customEveryNDays, 1);
});
