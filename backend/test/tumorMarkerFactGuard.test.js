const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyTumorMarkerItem, findTumorMarkerConflicts, findUnsupportedTumorMarkerElevation, upperReference } = require('../src/utils/tumorMarkerFactGuard');
const { extractTumorMarkers, buildTumorMarkerText } = require('../src/utils/labFromScreening');
const { buildEvidenceCatalog } = require('../src/utils/aiFactGuard');

const report = (date, value, referenceRange = '<6.9', status = 'normal') => ({
  checkDate: date,
  reportItems: [{ name: '糖类抗原CA72-4', value, referenceRange, status }],
});
const summary = text => ({ tumor_risk: { summary: text } });

test('CA72-4 normal values reject an elevated claim even if OCR marks abnormal', () => {
  const reports = [report('2025-06-01', '3.2'), report('2026-06-01', '4.1', '<6.9', 'abnormal')];
  assert.equal(findUnsupportedTumorMarkerElevation(summary('CA72-4持续轻度升高'), reports).marker, 'CA72-4');
  assert.equal(classifyTumorMarkerItem(reports[1].reportItems[0]), 'normal');
  assert.doesNotMatch(buildTumorMarkerText(extractTumorMarkers(reports)), /↑异常/);
  assert.match(buildEvidenceCatalog({}, reports), /CA72-4=4.1；状态=正常/);
});

test('a sustained elevation needs two above-range values and an elevated latest result', () => {
  const elevated = [report('2025-06-01', '7.2'), report('2026-06-01', '8.1')];
  assert.equal(findUnsupportedTumorMarkerElevation(summary('CA724持续升高'), elevated), null);
  assert.equal(findUnsupportedTumorMarkerElevation(summary('CA724持续升高'), [elevated[0], report('2026-06-01', '4.1')]).marker, 'CA72-4');
  assert.equal(findUnsupportedTumorMarkerElevation(summary('CA724持续升高'), [elevated[0]]).marker, 'CA72-4');
});

test('an isolated elevated claim requires a printed upper limit', () => {
  assert.equal(findUnsupportedTumorMarkerElevation(summary('CA72-4偏高'), [report('2026-06-01', '8.1')]), null);
  assert.equal(findUnsupportedTumorMarkerElevation(summary('CA72-4偏高'), [report('2026-06-01', '8.1', '')]).marker, 'CA72-4');
});

test('an old elevation cannot justify a current elevated claim after recent normal results', () => {
  const reports = [report('2018-05-01', '11.3'), report('2026-09-23', '9.05', '<19.10')];
  assert.equal(findUnsupportedTumorMarkerElevation(summary('CA72-4升高'), reports).marker, 'CA72-4');
  assert.equal(findUnsupportedTumorMarkerElevation(summary('CA72-4曾于2018年升高'), reports), null);
});

test('review preview names the AI claim and shows printed values and ranges', () => {
  const reports = [report('2018-04-01', '11.3', '0-6.9'), report('2021-07-01', '23.470', '0-6.90'),
    report('2024-07-01', '4.80', '<19.10'), report('2025-07-13', '9.28', '<19.10'),
    report('2026-09-23', '9.05', '<19.10')];
  const conflicts = findTumorMarkerConflicts({ tumor_risk: {
    abnormal: ['CA72-4近年持续高于参考上限'], summary: 'CA72-4近期偏高',
  } }, reports);
  assert.equal(conflicts.length, 2);
  assert.equal(conflicts[0].path, 'tumor_risk.abnormal[0]');
  assert.equal(conflicts[0].reason, 'latest_not_elevated');
  assert.deepEqual(conflicts[0].evidence.slice(0, 2).map(point => [point.value, point.referenceRange, point.classification]),
    [['9.05', '<19.10', 'normal'], ['9.28', '<19.10', 'normal']]);
  assert.equal(conflicts[0].evidence.at(-1).classification, 'elevated');
});

test('combined OCR rows cannot substantiate one marker elevation', () => {
  const reports = [{ checkDate: '2026-06-01', reportItems: [{
    name: 'CA72-4/CA19-9', value: '8.1', referenceRange: '<6.9', status: 'abnormal',
  }] }];
  assert.equal(findUnsupportedTumorMarkerElevation(summary('CA72-4升高'), reports).marker, 'CA72-4');
});

test('normal or explicitly negated statements are not rejected', () => {
  const reports = [report('2026-06-01', '4.1')];
  assert.equal(findUnsupportedTumorMarkerElevation(summary('CA72-4未见升高'), reports), null);
  assert.equal(findUnsupportedTumorMarkerElevation(summary('CA72-4在参考范围内'), reports), null);
});

test('printed reference upper limits can use inequalities or intervals', () => {
  assert.equal(upperReference('≤ 6.9 U/mL'), 6.9);
  assert.equal(upperReference('0～6.9'), 6.9);
  assert.equal(upperReference('未提供'), null);
});

test('OCR arrow beside a numeric result does not hide an above-range CA72-4 value', () => {
  const item = { name: 'CA72-4', value: '6.920↑', referenceRange: '≤6.900', status: 'unknown' };
  assert.equal(classifyTumorMarkerItem(item), 'elevated');
  assert.equal(classifyTumorMarkerItem({ ...item, value: '6.900↑' }), 'normal');
  assert.equal(classifyTumorMarkerItem({ ...item, value: '↑' }), 'unknown');
  const conflicts = findTumorMarkerConflicts(summary('CA72-4持续升高'), [{
    _id: 'source-report', checkDate: '2017-05-24', reportItems: [{ ...item, itemId: 'source-item' }],
  }, report('2026-09-23', '9.05', '<19.10')]);
  assert.equal(conflicts[0].reason, 'insufficient_repeated_evidence');
  assert.deepEqual([conflicts[0].evidence[1].reportId, conflicts[0].evidence[1].itemId], ['source-report', 'source-item']);
  assert.equal(conflicts[0].evidence[1].classification, 'elevated');
});
