const test = require('node:test');
const assert = require('node:assert/strict');
const { enforceHomocysteineIntervention } = require('../src/utils/homocysteineIntervention');

const report = (date, value, unit = 'μmol/L') => ({
  checkDate: date,
  reportItems: [{ name: '同型半胱氨酸 Hcy', value, unit }],
});

test('10 μmol/L is included in the intervention rule and overrides a reassuring AI action', () => {
  const topics = [{ name: '同型半胱氨酸', status: 'stable', nextAction: '无需干预，继续常规监测。' }];
  assert.equal(enforceHomocysteineIntervention(topics, [report('2026-09-23', '10')]), true);
  assert.equal(topics[0].status, 'attention');
  assert.match(topics[0].nextAction, /需干预/);
  assert.doesNotMatch(topics[0].nextAction, /无需干预/);
});

test('the latest value governs the intervention rule regardless of report input order', () => {
  const topics = [{ name: '同型半胱氨酸', nextAction: '原有建议' }];
  assert.equal(enforceHomocysteineIntervention(topics, [report('2026-09-23', '13.1'), report('2022-12-21', '14.6')]), true);
  assert.match(topics[0].nextAction, /13\.1 μmol\/L/);

  const nowBelowThreshold = [{ name: '同型半胱氨酸', nextAction: '原有建议' }];
  assert.equal(enforceHomocysteineIntervention(nowBelowThreshold, [report('2026-09-23', '9.9'), report('2022-12-21', '14.6')]), false);
  assert.equal(nowBelowThreshold[0].nextAction, '原有建议');
});

test('missing AI card is created from a valid result; an unknown unit is ignored', () => {
  const topics = [];
  assert.equal(enforceHomocysteineIntervention(topics, [report('2026-09-23', '13.1')]), true);
  assert.equal(topics[0].name, '同型半胱氨酸');
  assert.equal(topics[0].status, 'attention');
  assert.match(topics[0].latest, /13\.1 μmol\/L/);

  const invalid = [];
  assert.equal(enforceHomocysteineIntervention(invalid, [report('2026-09-23', '13.1', 'mg/L')]), false);
  assert.equal(invalid.length, 0);
});
