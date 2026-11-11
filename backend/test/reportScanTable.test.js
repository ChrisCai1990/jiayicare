const test = require('node:test');
const assert = require('node:assert/strict');
const { parseScannedLabTable } = require('../src/utils/reportScanTable');
const { filterMissingReportItems, mergeSupplementItems } = require('../src/utils/reportPageSupplement');

function word(side, x, y, text) {
  return { side, text, score: 0.99,
    box: [[x, y], [x + 75, y], [x + 75, y + 20], [x, y + 20]] };
}

test('two-column OCR rows keep names with values on the same side and section', () => {
  const rows = [
    word('left', 130, 50, '『血常规』'),
    word('left', 90, 100, '白细胞计数'), word('left', 600, 100, '5.7'), word('left', 820, 100, '3.5-9.5'),
    word('right', 1200, 100, '红细胞计数'), word('right', 1750, 100, '4.41'), word('right', 1950, 100, '3.8-5.1'),
    word('left', 90, 180, '尿隐血'), word('left', 560, 180, 'H'), word('left', 610, 180, '弱阳性'),
    word('right', 1200, 180, 'NK细胞CD(16/56)+ H 25.50'), word('right', 1950, 180, '5.17-24.65%'),
    word('left', 90, 260, '双阳性细胞'), word('left', 90, 290, 'CD3+CD4+CD8+'),
    word('left', 610, 275, '1.08'), word('left', 820, 275, '0.00-1.42%'),
    word('right', 1600, 360, '报告时间：2023/8/310:56:45'),
  ];
  const items = parseScannedLabTable(rows, { width: 2480, sourcePage: 9 });
  assert.equal(items.length, 5);
  assert.deepEqual(items.map(item => [item.name, item.value]), [
    ['白细胞计数', '5.7'], ['红细胞计数', '4.41'], ['尿隐血', '弱阳性'],
    ['NK细胞CD(16/56)+', '25.50'], ['双阳性细胞CD3+CD4+CD8+', '1.08'],
  ]);
  assert.equal(items[2].status, 'abnormal');
  assert.equal(items[3].status, 'abnormal');
  assert.equal(items.every(item => item.sourcePage === 9 && item.sourceSection === '血常规'), true);
  assert.equal(items.every(item => item.examDate === '2023-08-03'), true);
});

test('invalid page geometry is rejected', () => {
  assert.throws(() => parseScannedLabTable([], { width: 0, sourcePage: 9 }), /尺寸/);
});

test('scan review preserves different measured rows in different printed sections', () => {
  const candidates = [
    { name: '白细胞计数', value: '5.7', itemType: 'lab', sourcePage: 9, sourceSection: '血常规' },
    { name: '白细胞计数', value: '5.6', itemType: 'lab', sourcePage: 9, sourceSection: '免疫分型' },
  ];
  const options = { preserveDistinctMeasuredSections: true };
  const accepted = filterMissingReportItems([], candidates, options);
  assert.equal(accepted.length, 2);
  assert.equal(mergeSupplementItems([], accepted, options).added.length, 2);
  assert.equal(filterMissingReportItems([{
    ...candidates[0], manualReviewStatus: 'reviewed',
  }], candidates, options).length, 1);
});
