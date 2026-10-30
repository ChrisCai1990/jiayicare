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
