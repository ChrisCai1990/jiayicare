const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyTumorMarkerItem, findUnsupportedTumorMarkerElevation } = require('../src/utils/tumorMarkerFactGuard');

const claim = text => ({ tumor_risk: { summary: text } });
const latest = value => ({ checkDate: '2026-11-04', reportItems: [
  { name: '甲胎蛋白异质体(AFP-L3)', value: '1.72', referenceRange: '' },
  { name: '甲胎蛋白异质体比率', value: '11.05', referenceRange: '0.00-10.00' },
  { name: '甲胎蛋白(AFP)', value, referenceRange: '0.00-7.00' },
] });

test('AFP-L3 and its ratio do not obscure an audited total AFP elevation', () => {
  const reports = [latest('15.56'), { checkDate: '2026-07-07', reportItems: [
    { name: '甲胎蛋白', value: '18.6', referenceRange: '0.0-7.0' },
  ] }];
  assert.equal(classifyTumorMarkerItem(reports[0].reportItems[0]), null);
  assert.equal(classifyTumorMarkerItem(reports[0].reportItems[1]), null);
  assert.equal(classifyTumorMarkerItem(reports[0].reportItems[2]), 'elevated');
  assert.equal(findUnsupportedTumorMarkerElevation(claim('AFP升高'), reports), null);
  assert.equal(findUnsupportedTumorMarkerElevation(claim('AFP持续升高'), reports), null);
});

test('a normal or missing total AFP still rejects an elevation claim', () => {
  for (const value of ['6.00', '']) {
    const conflict = findUnsupportedTumorMarkerElevation(claim('AFP升高'), [latest(value)]);
    assert.equal(conflict?.marker, 'AFP');
    assert.equal(conflict?.evidence.length, 1);
    assert.equal(conflict?.evidence[0].itemName, '甲胎蛋白(AFP)');
  }
});
