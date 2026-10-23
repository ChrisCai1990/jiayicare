const test = require('node:test');
const assert = require('node:assert/strict');
const { focusedReportHits, reconcileFocusedTopics } = require('../src/utils/focusedTrendEvidence');

const rules = {
  冠脉CTA: /冠脉CTA|冠状动脉CTA|冠脉CT|冠状动脉CT/i,
  心电图: /心电图|ECG/i,
};

test('report-level CTA label counts when structured item is absent', () => {
  const reports = [
    { _id: 'new', title: '冠脉CTA', checkDate: '2026/9/26', reportYear: 2026,
      examConclusion: '冠脉各支未见明显钙化、狭窄。冠脉呈右优势型。', reportItems: [] },
    { _id: 'old', title: '冠脉CTA', checkDate: '2023-03-23', reportYear: 2023,
      reportItems: [{ name: '冠脉CTA', diagnosis: '左前降支非钙化斑块' }] },
  ];
  const hits = focusedReportHits(reports, '冠脉CTA', rules.冠脉CTA, 2026);
  assert.deepEqual(hits.map(hit => hit.year), [2023, 2026]);
  const topics = [{ name: '冠脉CTA', trend: '仅2023年一次冠脉CTA检查，无法判断趋势',
    trendStatus: 'baseline', keyChanges: ['2023年发现斑块'] }];
  reconcileFocusedTopics(topics, reports, rules, ['冠脉CTA'], 2026);
  assert.match(topics[0].trend, /2023、2026年/);
  assert.doesNotMatch(topics[0].trend, /仅2023年一次/);
  assert.match(topics[0].latest, /2026/);
  assert.ok(topics[0].keyChanges.some(change => change.includes('2026年')));
  assert.equal(topics[0].trendStatus, 'not_comparable');
  assert.deepEqual(topics[0].evidenceIds, ['RPT-002', 'RPT-001']);
});

test('missing examination card is built, but recommendation text alone does not count', () => {
  const reports = [
    { title: '心电图', checkDate: '2026-01-02', reportItems: [], examConclusion: '窦性心律' },
    { title: '门诊记录', checkDate: '2026-02-03', note: '建议冠脉CTA', reportItems: [] },
  ];
  const topics = [];
  reconcileFocusedTopics(topics, reports, rules, ['心电图', '冠脉CTA'], 2026);
  assert.deepEqual(topics.map(topic => topic.name), ['心电图']);
  assert.equal(topics[0].trendStatus, 'baseline');
});

test('record outside the selected five-year window is ignored', () => {
  const reports = [{ title: '冠脉CTA', reportYear: 2020, checkDate: '2020-01-01', reportItems: [] }];
  assert.equal(focusedReportHits(reports, '冠脉CTA', rules.冠脉CTA, 2026).length, 0);
});
