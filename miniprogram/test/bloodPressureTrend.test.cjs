const test = require('node:test');
const assert = require('node:assert/strict');
const { bloodPressurePoints, bloodPressurePointsForArm } = require('../src/utils/bloodPressureTrend');

test('same-time left and right readings retain both pressure values and distinct arms', () => {
  const at = '2026-10-09T09:15:00+08:00';
  const points = bloodPressurePoints([
    { recordedAt: at, value: '121/79', note: '右臂', extra: { sys: 121, dia: 79 } },
    { recordedAt: at, value: '122/84', note: '左臂', extra: { sys: 122, dia: 84 } },
  ]);
  assert.deepEqual(points.map(({ arm, sys, dia }) => ({ arm, sys, dia })), [
    { arm: '左臂', sys: 122, dia: 84 },
    { arm: '右臂', sys: 121, dia: 79 },
  ]);
  assert.deepEqual(bloodPressurePointsForArm([
    { recordedAt: at, value: '121/79', note: '右臂' },
    { recordedAt: at, value: '122/84', note: '左臂' },
  ], '左臂').map(point => [point.sys, point.dia]), [[122, 84]]);
  assert.deepEqual(bloodPressurePointsForArm([
    { recordedAt: at, value: '121/79', note: '右臂' },
    { recordedAt: at, value: '122/84', note: '左臂' },
  ], '右臂').map(point => [point.sys, point.dia]), [[121, 79]]);
});

test('old unmarked blood pressure is retained without inventing an arm', () => {
  const points = bloodPressurePoints([
    { recordedAt: '2026-10-08T08:00:00+08:00', value: '130/85' },
    { recordedAt: '2026-10-08T08:01:00+08:00', value: 'invalid' },
  ]);
  assert.equal(points.length, 1);
  assert.deepEqual([points[0].arm, points[0].sys, points[0].dia], ['未标注', 130, 85]);
});
