const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEchoChamberTrend } = require('../src/utils/echoChamberTrend');

const echo = (date, reportItems, extra = {}) => ({ title: '心脏超声', checkDate: date, reportItems, ...extra });

test('echo comparison carries dates, converts cm to mm, and excludes years outside the five-year window', () => {
  const reports = [
    echo('2021-05-01', [{ name: '左房内径', value: '31', unit: 'mm' }]),
    echo('2023-06-10', [
      { name: '左房内径', value: '3.2', unit: 'cm' },
      { name: '左室舒张末内径', value: '48', unit: 'mm' },
      { name: '左房容积', value: '40', unit: 'mL' },
    ]),
    echo('2026-09-24', [
      { name: '左房内径', value: '35', unit: 'mm' },
      { name: '左室舒张末内径', value: '5.0', unit: 'cm' },
      { name: '右室内径', value: '2.4', unit: 'cm' },
      { name: '左房容积', value: '45', unit: 'mL' },
      { name: '左房容积指数', value: '27', unit: 'mL/m²' },
    ]),
  ];
  const result = buildEchoChamberTrend(reports, 2026);
  const byKey = Object.fromEntries(result.map(metric => [metric.key, metric]));
  assert.deepEqual(byKey.la_diameter.points.map(point => [point.date, point.value]), [
    ['2023-06-10', 32], ['2026-09-24', 35],
  ]);
  assert.equal(byKey.la_diameter.change, 3);
  assert.equal(byKey.lv_diastolic_diameter.change, 2);
  assert.equal(byKey.rv_diameter.change, null);
  assert.equal(byKey.la_volume.change, 5);
  assert.equal(byKey.la_volume_index.points[0].value, 27);
});

test('echo parser keeps prose measurements separate and does not infer dimensions from descriptions or missing units', () => {
  const result = buildEchoChamberTrend([
    echo('2024-03-01', [{ name: '心脏超声', findings: '左房内径：33mm；右房内径：32mm；左室舒张末内径：49mm' }]),
    echo('2026-03-01', [{ name: '左房内径', value: '36' }, { name: '心脏超声', conclusion: '左房稍大' }]),
  ], 2026);
  const byKey = Object.fromEntries(result.map(metric => [metric.key, metric]));
  assert.equal(byKey.la_diameter.points.length, 1);
  assert.equal(byKey.la_diameter.change, null);
  assert.equal(byKey.ra_diameter.points[0].value, 32);
  assert.equal(byKey.lv_diastolic_diameter.points[0].value, 49);
});

test('left atrial volume index in prose stays separate from atrial diameter and volume', () => {
  const result = buildEchoChamberTrend([
    echo('2026-03-01', [{ name: '心脏超声', findings: 'LAVI 27mL/m²；左房容积 44mL；左房内径 35mm' }]),
  ], 2026);
  const byKey = Object.fromEntries(result.map(metric => [metric.key, metric]));
  assert.equal(byKey.la_volume_index.points[0].value, 27);
  assert.equal(byKey.la_volume.points[0].value, 44);
  assert.equal(byKey.la_diameter.points[0].value, 35);
});

test('non-echo reports and different left-ventricular phases are not mixed into echo size trends', () => {
  const result = buildEchoChamberTrend([
    { title: '腹部超声', checkDate: '2025-01-01', reportItems: [{ name: '左房内径', value: '40', unit: 'mm' }] },
    echo('2025-01-01', [{ name: '左室收缩末内径', value: '30', unit: 'mm' }]),
    echo('2026-01-01', [{ name: '左室舒张末内径', value: '50', unit: 'mm' }]),
  ], 2026);
  assert.equal(result.find(metric => metric.key === 'la_diameter'), undefined);
  assert.equal(result.find(metric => metric.key === 'lv_diastolic_diameter').points.length, 1);
});

test('item examination dates override a combined report date', () => {
  const result = buildEchoChamberTrend([
    echo('2026-10-01', [
      { name: '左房内径', value: '31', unit: 'mm', examDate: '2021-05-01' },
      { name: '右房内径', value: '34', unit: 'mm', examDate: '2024-05-01' },
    ]),
  ], 2026);
  assert.equal(result.find(metric => metric.key === 'la_diameter'), undefined);
  assert.equal(result.find(metric => metric.key === 'ra_diameter').points[0].date, '2024-05-01');
});

test('measurements from the same day do not create a longitudinal trend', () => {
  const result = buildEchoChamberTrend([
    echo('2026-04-01', [{ name: '左房内径', value: '34', unit: 'mm' }]),
    echo('2026-04-01', [{ name: '左房内径', value: '36', unit: 'mm' }]),
  ], 2026);
  const metric = result.find(row => row.key === 'la_diameter');
  assert.equal(metric.change, null);
  assert.match(metric.note, /不一致/);
});

test('compact chamber names with measured units can be compared', () => {
  const result = buildEchoChamberTrend([
    echo('2023-02-01', [{ name: '左房（LA）', value: '3.2', unit: 'cm' }, { name: '右房', value: '31', unit: 'mm' }]),
    echo('2026-02-01', [{ name: '左房（LA）', value: '35', unit: 'mm' }, { name: '右房', value: '32', unit: 'mm' }]),
  ], 2026);
  assert.equal(result.find(metric => metric.key === 'la_diameter').change, 3);
  assert.equal(result.find(metric => metric.key === 'ra_diameter').change, 1);
});
