const test = require('node:test');
const assert = require('node:assert/strict');
const { patientAge, buildMonitoringReminderSpecs, activeToday } = require('../src/utils/annualPlanMonitoringReminders');

test('35岁及以上客户获得每周血压提醒和每周体重提醒', () => {
  const specs = buildMonitoringReminderSpecs({ age: 35, chronicDiseases: [] });
  const bp = specs.find(item => item.sourceKey === 'blood_pressure');
  const weight = specs.find(item => item.sourceKey === 'weight');
  assert.deepEqual(bp.daysOfWeek, ['Mon']);
  assert.deepEqual(weight.daysOfWeek, ['Mon']);
});

test('高血压客户获得每周两次血压提醒，不受年龄限制', () => {
  const specs = buildMonitoringReminderSpecs({ age: 28, chronicDiseases: ['高血压'] });
  const bp = specs.find(item => item.sourceKey === 'blood_pressure');
  assert.deepEqual(bp.daysOfWeek, ['Mon', 'Thu']);
});

test('近30天出现140/90及以上读数时自动提升为每日血压提醒', () => {
  const specs = buildMonitoringReminderSpecs({ age: 28 }, {}, [{ value: '145/92', extra: { sys: 145, dia: 92 } }]);
  const bp = specs.find(item => item.sourceKey === 'blood_pressure');
  assert.equal(bp.customEveryNDays, 1);
  assert.deepEqual(bp.daysOfWeek, []);
});

test('体重提醒覆盖所有年度管理客户，超重客户每周两次', () => {
  const normal = buildMonitoringReminderSpecs({ age: 20, height: 170, weight: 60 });
  assert.deepEqual(normal.find(item => item.sourceKey === 'weight').daysOfWeek, ['Mon']);
  const overweight = buildMonitoringReminderSpecs({ age: 20, height: 170, weight: 75 });
  assert.deepEqual(overweight.find(item => item.sourceKey === 'weight').daysOfWeek, ['Mon', 'Thu']);
});

test('已有人工监测规则时保留其频率和时间', () => {
  const existing = [{ items: '血压', frequency: '每周两次', time: '07:30' }];
  const specs = buildMonitoringReminderSpecs({ age: 50 }, { monitoring: { records: existing } });
  const bp = specs.find(item => item.sourceKey === 'blood_pressure');
  assert.deepEqual(bp.daysOfWeek, ['Mon', 'Thu']);
  assert.equal(bp.reminderTime, '07:30');
});

test('生日未到时年龄不会提前增加', () => {
  assert.equal(patientAge({ birthDate: '1991-12-01' }, new Date('2026-09-18T00:00:00Z')), 34);
});

test('系统监测只在设定星期进入通知，不进入每日任务', () => {
  const reminder = { enabled: true, scheduleType: 'recurring', daysOfWeek: ['Fri'], startDate: '2026-09-01', endDate: '2026-12-31' };
  assert.equal(activeToday(reminder, new Date('2026-09-18T08:00:00')), true);
  assert.equal(activeToday(reminder, new Date('2026-09-19T08:00:00')), false);
});
