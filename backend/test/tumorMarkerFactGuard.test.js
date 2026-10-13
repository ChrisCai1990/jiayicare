const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyTumorMarkerItem, findUnsupportedTumorMarkerElevation, upperReference } = require('../src/utils/tumorMarkerFactGuard');
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
