const test = require('node:test');
const assert = require('node:assert/strict');
const { compareReportExtractions, comparePageCoverage, validateCoverageAcknowledgement } = require('../src/utils/reportExtractionDiff');

const extraction = (version, items, ossKeys = ['reports-test/source.pdf']) => ({
  version,
  source: { ossKeys },
  items,
});

test('compares two OCR versions from the same original without merging them', () => {
  const baseline = extraction(1, [
    { sourceItemId: 'p10-cbc-wbc', sourcePage: 10, name: '白细胞', value: '5.0', unit: '10^9/L' },
    { sourceItemId: 'p10-cbc-hgb', sourcePage: 10, name: '血红蛋白', value: '140', unit: 'g/L' },
  ]);
  const current = extraction(2, [
    { sourceItemId: 'p10-cbc-wbc', sourcePage: 10, name: '白细胞', value: '5.2', unit: '10^9/L' },
    { sourceItemId: 'p11-glu', sourcePage: 11, name: '空腹血糖', value: '5.1', unit: 'mmol/L' },
  ]);
  const result = compareReportExtractions(current, baseline);

  assert.equal(result.sameSource, true);
  assert.deepEqual(result.summary, {
    currentCount: 2,
    baselineCount: 2,
    added: 1,
    removed: 1,
    changed: 1,
    dropCount: 0,
    dropRatio: 0,
    severity: 'high',
    highAttentionRemoved: 1,
  });
  assert.equal(result.removed[0].name, '血红蛋白');
  assert.equal(result.highAttentionRemoved[0].sourcePage, 10);
  assert.deepEqual(result.changed[0].changes.map(change => change.field), ['value']);
});

test('marks a material item-count drop for review even when names are not on the attention list', () => {
  const baseline = extraction(1, Array.from({ length: 10 }, (_, index) => ({ sourceItemId: `item-${index}`, name: `项目${index}` })));
  const current = extraction(2, baseline.items.slice(0, 8));
  const result = compareReportExtractions(current, baseline);

  assert.equal(result.summary.dropRatio, 0.2);
  assert.equal(result.summary.severity, 'high');
  assert.equal(result.summary.removed, 2);
});

test('refuses to describe versions from different originals as the same source', () => {
  const result = compareReportExtractions(
    extraction(2, [], ['reports-test/new.pdf']),
    extraction(1, [], ['reports-test/old.pdf']),
  );
  assert.equal(result.sameSource, false);
});

test('highlights pages that changed from populated to empty', () => {
  const result = comparePageCoverage(
    [
      { sourcePage: 9, name: '外科' },
      { sourcePage: 15, name: '胆囊彩超' },
    ],
    [
      { sourcePage: 9, name: '外科' },
      { sourcePage: 14, name: '肝脏' },
      { sourcePage: 14, name: '胆囊' },
      { sourcePage: 15, name: '胆囊彩超' },
      { sourcePage: 16, name: '肝脏彩超' },
    ],
  );

  assert.deepEqual(result.emptied, [
    { page: 14, baselineCount: 2, currentCount: 0 },
    { page: 16, baselineCount: 1, currentCount: 0 },
  ]);
  assert.deepEqual(result.newlyPopulated, []);
});

test('requires explicit acknowledgement for every emptied page', () => {
  const diff = { pageCoverage: { emptied: [{ page: 14 }, { page: 16 }, { page: 17 }] } };
  assert.deepEqual(validateCoverageAcknowledgement(diff, [14, 17]), {
    requiredPages: [14, 16, 17],
    missingPages: [16],
    complete: false,
  });
  assert.equal(validateCoverageAcknowledgement(diff, [14, 16, 17]).complete, true);
});
