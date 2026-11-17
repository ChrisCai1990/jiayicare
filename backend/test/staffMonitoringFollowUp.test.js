const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { monitoringRecordId, monitoringMeasurement } = require('../src/utils/staffMonitoringFollowUp');
const { nextWeeklyDate } = require('../src/utils/rollingWeeklyFollowUp');

test('同一内部随访使用固定档案记录 ID，避免重试重复写入', () => {
  const taskId = new mongoose.Types.ObjectId();
  assert.equal(String(monitoringRecordId(taskId)), String(monitoringRecordId(taskId)));
  assert.notEqual(String(monitoringRecordId(taskId)), String(monitoringRecordId(new mongoose.Types.ObjectId())));
});

test('同一周血压和体重各有固定档案记录 ID，旧单项任务 ID 保持兼容', () => {
  const taskId = new mongoose.Types.ObjectId();
  const pressureId = monitoringRecordId(taskId, 'bloodPressure');
  const weightId = monitoringRecordId(taskId, 'weight');
  assert.notEqual(String(pressureId), String(weightId));
  assert.notEqual(String(pressureId), String(monitoringRecordId(taskId)));
  assert.equal(String(pressureId), String(monitoringRecordId(taskId, 'bloodPressure')));
  const input = { recordedAt: '2026-10-28T02:30:00.000Z', sys: '135', dia: '85', weight: '72.4' };
  const measurements = ['bloodPressure', 'weight'].map(item => monitoringMeasurement(input, item, new Date('2026-10-28T03:00:00.000Z')));
  assert.deepEqual(measurements.map(row => row.type), ['bloodPressure', 'weight']);
  assert.equal(measurements[0].recordedAt.getTime(), measurements[1].recordedAt.getTime());
  assert.equal(measurements[0].value, '135/85');
  assert.equal(measurements[1].value, '72.4');
});

test('周一计划周三实测时，血压数据和下一次日期都采用周三', () => {
  const measuredAt = '2026-10-28T02:30:00.000Z';
  const result = monitoringMeasurement({ recordedAt: measuredAt, sys: '135', dia: '85', note: '电话核实' },
    'bloodPressure', new Date('2026-10-28T03:00:00.000Z'));
  assert.equal(result.value, '135/85');
  assert.deepEqual(result.extra, { sys: 135, dia: 85 });
  assert.equal(nextWeeklyDate(result.recordedAt).toISOString(), '2026-11-04T00:00:00.000Z');
});

test('体重和未来时间、无效读数校验', () => {
  const now = new Date('2026-10-28T03:00:00.000Z');
  const weight = monitoringMeasurement({ recordedAt: '2026-10-28T02:00:00Z', weight: '72.4' }, 'weight', now);
  assert.equal(weight.value, '72.4');
  assert.deepEqual(weight.vitals, { weight: 72.4 });
  assert.throws(() => monitoringMeasurement({ recordedAt: '2026-10-29T02:00:00Z', weight: 72 }, 'weight', now), /未来时间/);
  assert.throws(() => monitoringMeasurement({ recordedAt: '2026-10-28T02:00:00Z', sys: 80, dia: 90 }, 'bloodPressure', now), /收缩压/);
});
