const test = require('node:test');
const assert = require('node:assert/strict');
const {
  itemTouchesPage,
  linkedReportItemPages,
  mergeAdjacentReportItemEvidence,
  normalizeReportItemEvidence,
  reportItemSourcePages,
} = require('../src/utils/reportItemEvidence');
const MedicalReport = require('../src/models/MedicalReport');

test('legacy sourcePage is normalized into a page evidence collection', () => {
  const [item] = normalizeReportItemEvidence([{
    name: '胸部CT', itemType: 'imaging', sourcePage: 8,
    evidenceText: '肺部未见明显异常', textLayerEvidence: 'verified',
  }]);
  assert.equal(item.sourcePage, 8);
  assert.deepEqual(item.sourcePages, [8]);
  assert.deepEqual(item.sourceEvidence, [{ page: 8, text: '肺部未见明显异常', method: 'text_layer' }]);
});

test('exact adjacent imaging continuations merge without losing page evidence', () => {
  const result = mergeAdjacentReportItemEvidence([
    { name: '胸部CT', itemType: 'imaging', sourceSection: 'CT室', sourcePage: 8, findings: '双肺纹理增多', status: 'attention' },
    { name: '胸部CT', itemType: 'imaging', sourceSection: 'CT室', sourcePage: 9, diagnosis: '建议结合临床复查', status: 'unknown' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourcePage, 8);
  assert.deepEqual(result[0].sourcePages, [8, 9]);
  assert.equal(result[0].findings, '双肺纹理增多');
  assert.equal(result[0].diagnosis, '建议结合临床复查');
  assert.equal(itemTouchesPage(result[0], 9), true);
});

test('automatic continuation merge clears stale continuation review flags', () => {
  const [item] = mergeAdjacentReportItemEvidence([
    { name: '胸部CT', itemType: 'imaging', sourceSection: 'CT室', sourcePage: 8, findings: '双肺纹理增多', qualityFlags: ['cross_page_continuation_candidate'] },
    { name: '胸部CT', itemType: 'imaging', sourceSection: 'CT室', sourcePage: 9, diagnosis: '建议复查' },
  ]);

  assert.ok(!item.qualityFlags.includes('cross_page_continuation_candidate'));
});

test('lab rows and non-adjacent records are never auto-merged', () => {
  const rows = mergeAdjacentReportItemEvidence([
    { name: '血糖', itemType: 'lab', sourcePage: 8, value: '5.1' },
    { name: '血糖', itemType: 'lab', sourcePage: 9, value: '5.2' },
    { name: '胸部CT', itemType: 'imaging', sourcePage: 10, findings: 'A' },
    { name: '胸部CT', itemType: 'imaging', sourcePage: 12, findings: 'B' },
  ]);
  assert.equal(rows.length, 4);
  assert.deepEqual(reportItemSourcePages(rows[1]), [9]);
});

test('repeated complete imaging rows on adjacent pages are not mistaken for continuations', () => {
  const rows = mergeAdjacentReportItemEvidence([
    { name: '皮肤', itemType: 'imaging', sourceSection: '外科', sourcePage: 8, findings: '未见明显异常', diagnosis: '未见明显异常' },
    { name: '皮肤', itemType: 'imaging', sourceSection: '外科', sourcePage: 9, findings: '未见明显异常', diagnosis: '未见明显异常' },
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(reportItemSourcePages), [[8], [9]]);
});

test('same-field prose on a later page remains separate for manual continuation review', () => {
  const rows = mergeAdjacentReportItemEvidence([
    { name: '心脏彩超', itemType: 'imaging', sourceSection: '心脏彩超', sourcePage: 18, findings: '左房饱满' },
    { name: '心脏彩超', itemType: 'imaging', sourceSection: '心脏彩超', sourcePage: 19, findings: '心包未见分离' },
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(reportItemSourcePages), [[18], [19]]);
  assert.ok(rows.every(item => item.qualityFlags.includes('cross_page_continuation_candidate')));
});

test('identical repeated prose is not labelled as a continuation candidate', () => {
  const rows = mergeAdjacentReportItemEvidence([
    { name: '皮肤', itemType: 'imaging', sourceSection: '外科', sourcePage: 8, findings: '未见明显异常' },
    { name: '皮肤', itemType: 'imaging', sourceSection: '外科', sourcePage: 9, findings: '未见明显异常' },
  ]);

  assert.equal(rows.length, 2);
  assert.ok(rows.every(item => !(item.qualityFlags || []).includes('cross_page_continuation_candidate')));
});

test('multiple evidence inputs are deduplicated and sorted', () => {
  assert.deepEqual(reportItemSourcePages({
    sourcePage: 9,
    sourcePages: [10, 8, 9],
    sourceEvidence: [{ page: 10 }, { page: 11 }],
  }), [8, 9, 10, 11]);
});

test('linked pages identify every other evidence page for safe single-page supplementation', () => {
  assert.deepEqual(linkedReportItemPages([
    { name: 'A', sourcePages: [21, 22] },
    { name: 'B', sourcePages: [20, 21, 23] },
    { name: 'C', sourcePage: 21 },
  ], 21), [20, 22, 23]);
  assert.deepEqual(linkedReportItemPages([{ sourcePages: [21, 22] }], 19), []);
});

test('mongoose report subdocuments normalize into plain snapshot items', () => {
  const report = new MedicalReport({
    user: '507f1f77bcf86cd799439011',
    title: 'test',
    reportItems: [{ name: '胸部CT', itemType: 'imaging', sourcePage: 8 }],
  });
  const [item] = normalizeReportItemEvidence(report.reportItems);
  assert.equal(item.name, '胸部CT');
  assert.deepEqual(item.sourcePages, [8]);
  assert.equal(Object.prototype.hasOwnProperty.call(item, '$__parent'), false);
});

test('cross-page merge preserves independently reviewable evidence for every source page', () => {
  const [item] = mergeAdjacentReportItemEvidence([
    {
      name: 'Chest CT', itemType: 'imaging', sourceSection: 'CT', sourcePage: 21,
      findings: 'finding on page 21', evidenceText: 'page 21 evidence', textLayerEvidence: 'verified',
    },
    {
      name: 'Chest CT', itemType: 'imaging', sourceSection: 'CT', sourcePage: 22,
      diagnosis: 'conclusion on page 22', evidenceText: 'page 22 evidence', textLayerEvidence: 'verified',
    },
  ]);

  assert.deepEqual(item.sourcePages, [21, 22]);
  assert.deepEqual(item.sourceEvidence, [
    { page: 21, text: 'page 21 evidence', method: 'text_layer' },
    { page: 22, text: 'page 22 evidence', method: 'text_layer' },
  ]);
});

test('cross-page continuation merges even when another page item is between both fragments', () => {
  const result = mergeAdjacentReportItemEvidence([
    {
      name: 'Chest CT', itemType: 'imaging', sourceSection: 'CT', sourcePage: 21,
      findings: 'finding on page 21', evidenceText: 'page 21 evidence', textLayerEvidence: 'verified',
    },
    {
      name: 'Bone density', itemType: 'data', sourceSection: 'Imaging', sourcePage: 22,
      value: 'normal', evidenceText: 'unrelated page 22 evidence', textLayerEvidence: 'verified',
    },
    {
      name: 'Chest CT', itemType: 'imaging', sourceSection: 'CT', sourcePage: 22,
      diagnosis: 'conclusion on page 22', evidenceText: 'page 22 evidence', textLayerEvidence: 'verified',
    },
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'Chest CT');
  assert.deepEqual(result[0].sourcePages, [21, 22]);
  assert.equal(result[0].diagnosis, 'conclusion on page 22');
  assert.equal(result[1].name, 'Bone density');
});

test('multiple evidence fragments on one page are retained as hybrid evidence', () => {
  const [item] = normalizeReportItemEvidence([{
    name: 'Chest CT', itemType: 'imaging', sourcePage: 21,
    sourceEvidence: [
      { page: 21, text: 'text layer evidence', method: 'text_layer' },
      { page: 21, text: 'visual evidence', method: 'visual' },
    ],
  }]);

  assert.deepEqual(item.sourceEvidence, [{
    page: 21,
    text: 'text layer evidence\nvisual evidence',
    method: 'hybrid',
  }]);
});
